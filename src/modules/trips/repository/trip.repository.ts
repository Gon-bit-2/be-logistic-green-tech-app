import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { GetTripListQueryType, TripStopType } from 'src/modules/trips/model/trip.model'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { Prisma } from 'generated/prisma'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { OrderStateService } from 'src/common/services/order-state.service'
import { EVENT_SOURCE, EventSourceValue } from 'src/common/constants/tracking.constant'

/**
 * Data repository class for managing Trips and stops.
 * Integrates directly with Prisma for DB CRUD and coordinates transactional state transitions.
 *
 * Lớp repository dữ liệu chịu trách nhiệm quản lý Chuyến đi và Điểm dừng.
 * Tích hợp trực tiếp với Prisma để CRUD DB và điều phối các chuyển đổi trạng thái trong transaction.
 */
@Injectable()
export class TripRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly orderStateService: OrderStateService,
  ) {}

  /**
   * Helper function to build a Prisma query filter for pending/dispatchable orders.
   *
   * Hàm hỗ trợ xây dựng bộ lọc truy vấn Prisma cho các đơn hàng đang chờ hoặc có thể điều phối.
   *
   * @param hubId Optional hub ID to scope the query.
   *              Hub ID tùy chọn để giới hạn truy vấn.
   * @returns The Prisma order where input query object.
   *          Đối tượng truy vấn Prisma order where.
   */
  private buildPendingOrdersWhere(hubId?: number): Prisma.OrderWhereInput {
    return {
      status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
      deletedAt: null,
      currentTripId: null,
      ...DISPATCHABLE_PAYMENT_FILTER,
      ...(hubId ? { currentHubId: hubId } : {}),
    }
  }

  /**
   * Counts pending, dispatchable orders.
   *
   * Đếm số lượng đơn hàng đang chờ, có thể điều phối.
   *
   * @param hubId Optional hub ID.
   *              Hub ID tùy chọn.
   * @returns A promise resolving to the total count.
   *          Một promise trả về tổng số lượng.
   */
  async countPendingOrders(hubId?: number) {
    return this.prismaService.order.count({
      where: this.buildPendingOrdersWhere(hubId),
    })
  }

  /**
   * Finds pending, dispatchable orders sorted by creation time.
   *
   * Tìm kiếm các đơn hàng đang chờ, có thể điều phối được sắp xếp theo thời gian tạo.
   *
   * @param hubId Optional hub ID.
   *              Hub ID tùy chọn.
   * @param limit Optional limit for pagination/take.
   *              Giới hạn tùy chọn cho phân trang/lấy dữ liệu.
   * @returns A promise resolving to an array of orders.
   *          Một promise trả về mảng các đơn hàng.
   */
  async findPendingOrders(hubId?: number, limit?: number) {
    return this.prismaService.order.findMany({
      where: this.buildPendingOrdersWhere(hubId),
      orderBy: {
        createdAt: 'asc',
      },
      ...(limit ? { take: limit } : {}),
    })
  }

  /**
   * Retrieves active, available vehicles not currently assigned to any active trip.
   * Prioritizes EVs (Electric Vans) and larger capacity weights.
   *
   * Lấy danh sách phương tiện đang hoạt động, khả dụng và không bị gán vào bất kỳ chuyến đi nào.
   * Ưu tiên các dòng xe điện (Electric Van) và xe có tải trọng lớn hơn.
   *
   * @param hubId Optional hub ID.
   *              Hub ID tùy chọn.
   * @returns A promise resolving to available vehicles.
   *          Một promise trả về các phương tiện khả dụng.
   */
  async findAvailableVehicles(hubId?: number) {
    return this.prismaService.vehicle.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(hubId ? { hubId } : {}),
        trips: {
          none: {
            status: {
              in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS],
            },
          },
        },
      },
      // Select chỉ các field cần thiết cho dispatch, tránh trả toàn bộ columns
      select: {
        id: true,
        licensePlate: true,
        type: true,
        capacityWeight: true,
        capacityVolume: true,
        hubId: true,
        fuelType: true,
        emissionRatePerKm: true,
      },
      orderBy: [
        { type: 'asc' }, // Giả định: mảng Enum có ELECTRIC_VAN là thứ tự cao hoặc mình tự sort lại ở Code.
        { capacityWeight: 'desc' }, // Xe to được lấy trước để chở nhiều
      ],
    })
  }

  /**
   * Retrieves active drivers not currently driving any ongoing trips.
   *
   * Lấy danh sách tài xế đang hoạt động, rảnh rỗi và không lái bất kỳ chuyến đi nào.
   *
   * @param hubId Optional hub ID.
   *              Hub ID tùy chọn.
   * @returns A promise resolving to the list of available drivers.
   *          Một promise trả về danh sách các tài xế khả dụng.
   */
  async findAvailableDrivers(hubId?: number) {
    return this.prismaService.user.findMany({
      where: {
        role: { name: 'DRIVER' },
        isDeleted: false,
        deletedAt: null,
        // Chỉ lấy tài xế thuộc cùng Hub (nếu dispatch theo Hub)
        ...(hubId ? { hubId } : {}),
        // Không đang lái chuyến nào đang hoạt động
        tripsDriven: {
          none: {
            status: {
              in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS],
            },
          },
        },
      },
      // KHÔNG BAO GIỜ trả về password, totpSecret ra ngoài auth flow
      select: {
        id: true,
        fullName: true,
        phone: true,
        avatar: true,
        hubId: true,
      },
    })
  }

  /**
   * Creates a Trip with multiple stops and links the orders in a secure Prisma transaction.
   * Performs an Optimistic Concurrency Check inside the transaction to verify orders are still pending.
   *
   * Tạo chuyến đi với nhiều điểm dừng và liên kết các đơn hàng trong một giao dịch Prisma an toàn.
   * Thực hiện Kiểm tra đồng thời lạc quan (Optimistic Concurrency Check) trong transaction để xác minh đơn hàng vẫn đang chờ.
   *
   * @param vehicleId Unique identifier of the vehicle.
   *                  Mã định danh duy nhất của phương tiện.
   * @param driverId Unique identifier of the driver user.
   *                 Mã định danh duy nhất của tài xế.
   * @param orderIds Array of order IDs to dispatch.
   *                 Mảng các ID đơn hàng cần điều phối.
   * @param stopsData Sequence of stop points to create.
   *                  Chuỗi các điểm dừng cần tạo.
   * @param totalDistance Total path distance in kilometers.
   *                      Tổng khoảng cách tuyến đường bằng kilomet.
   * @param options Transactional execution settings (e.g., partial assignment approvals, actors).
   *                Cài đặt thực thi giao dịch (ví dụ: duyệt gán bán phần, người dùng thực hiện).
   * @returns A promise resolving to the created trip or null.
   *          Một promise trả về chuyến đi đã tạo hoặc null.
   * @throws {BadRequestException} If data overlaps, order lists are empty, stops are mismatched, or race conditions occur.
   *                               Nếu trùng lặp dữ liệu, danh sách đơn trống, điểm dừng không khớp hoặc xảy ra xung đột tranh chấp.
   */
  async createTripWithStops(
    vehicleId: number,
    driverId: number,
    orderIds: number[],
    stopsData: Omit<TripStopType, 'id' | 'tripId'>[],
    totalDistance?: number,
    options?: {
      allowPartial?: boolean
      assignmentRequestToApproveId?: number | null
      stateCreatedById?: number | null
      stateSource?: EventSourceValue
    },
  ) {
    const requestedOrderIds = [...new Set(orderIds)]
    if (requestedOrderIds.length !== orderIds.length) {
      throw new BadRequestException('Danh sách đơn hàng không được chứa trùng lặp.')
    }
    if (!requestedOrderIds.length) {
      throw new BadRequestException('Cần chọn ít nhất một đơn hàng để tạo chuyến.')
    }

    return this.prismaService.$transaction(async (tx) => {
      const [activeVehicleTrip, activeDriverTrip] = await Promise.all([
        tx.trip.findFirst({
          where: {
            status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
            vehicleId,
          },
          select: { id: true },
        }),
        tx.trip.findFirst({
          where: {
            driverId,
            status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
          },
          select: { id: true },
        }),
      ])

      if (activeVehicleTrip) {
        throw new BadRequestException(`Xe #${vehicleId} đang bận ở chuyến #${activeVehicleTrip.id}`)
      }

      if (activeDriverTrip) {
        throw new BadRequestException(`Tài xế #${driverId} đang bận ở chuyến #${activeDriverTrip.id}`)
      }

      // ====== OPTIMISTIC CONCURRENCY CHECK ======
      // Re-query các Order bên trong Transaction để kiểm tra chúng vẫn sẵn sàng dispatch
      const stillPendingOrders = await tx.order.findMany({
        where: {
          id: { in: requestedOrderIds },
          status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
          currentTripId: null,
          ...DISPATCHABLE_PAYMENT_FILTER,
        },
        select: { id: true },
      })

      const validOrderIds = stillPendingOrders.map((o) => o.id)
      const allowPartial = options?.allowPartial ?? false

      if (validOrderIds.length === 0 && allowPartial) {
        return null
      }

      if (!allowPartial && validOrderIds.length !== requestedOrderIds.length) {
        throw new BadRequestException('Một hoặc nhiều đơn hàng không còn khả dụng để điều phối.')
      }

      if (validOrderIds.length === 0) {
        throw new BadRequestException('Không còn đơn hàng khả dụng để tạo chuyến.')
      }

      // Lọc lại stopsData chỉ giữ những node thuộc các Order còn hợp lệ
      const validOrderIdSet = new Set(validOrderIds)
      const filteredStops = stopsData.filter(
        (stop) => stop.orderId === null || stop.orderId === undefined || validOrderIdSet.has(stop.orderId),
      )
      const stopOrderIds = new Set(
        filteredStops.map((stop) => stop.orderId).filter((orderId): orderId is number => orderId != null),
      )
      const missingStopOrderIds = validOrderIds.filter((orderId) => !stopOrderIds.has(orderId))
      if (missingStopOrderIds.length) {
        throw new BadRequestException(`Thiếu stop cho đơn hàng: ${missingStopOrderIds.join(', ')}`)
      }

      // 1. Tạo Trip (bao gồm totalDistance ước tính từ Route Optimization)
      const trip = await tx.trip.create({
        data: {
          vehicleId,
          driverId,
          status: TRIP_STATUS.PENDING,
          totalDistance: totalDistance ?? null,
          stops: {
            create: filteredStops,
          },
        },
        include: {
          stops: true,
        },
      })

      // 2. Chuyển trạng thái Order sang ASSIGNED, gán currentTripId và ghi audit event
      await this.orderStateService.transitionOrdersInTransaction({
        createdById: options?.stateCreatedById ?? null,
        description: `Đơn hàng được gán vào chuyến #${trip.id}.`,
        expectedCurrentTripId: null,
        expectedStatuses: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB],
        extraWhere: DISPATCHABLE_PAYMENT_FILTER,
        nextOrderData: {
          currentTripId: trip.id,
        },
        orderIds: validOrderIds,
        source: options?.stateSource ?? EVENT_SOURCE.SYSTEM,
        status: ORDER_STATUS.ASSIGNED,
        tx,
        validationMode: 'system',
      })

      await tx.driverAssignmentRequest.updateMany({
        where: {
          orderId: { in: validOrderIds },
          status: 'PENDING',
          ...(options?.assignmentRequestToApproveId ? { id: { not: options.assignmentRequestToApproveId } } : {}),
        },
        data: {
          status: 'CANCELLED',
          reviewedAt: new Date(),
        },
      })

      if (options?.assignmentRequestToApproveId) {
        await tx.driverAssignmentRequest.update({
          where: { id: options.assignmentRequestToApproveId },
          data: {
            reviewedAt: new Date(),
            status: 'APPROVED',
          },
        })
      }

      return trip
    })
  }

  /**
   * Retrieves a paginated list of trips, filtered by status, vehicle, driver, or hub.
   *
   * Lấy danh sách chuyến đi có phân trang, được lọc theo trạng thái, phương tiện, tài xế, hoặc hub.
   *
   * @param query The paginated filter query parameters.
   *              Các tham số truy vấn bộ lọc phân trang.
   * @returns A promise resolving to paginated trips metadata.
   *          Một promise trả về siêu dữ liệu phân trang các chuyến đi.
   */
  async findAll(query: GetTripListQueryType) {
    const { limit, page, status, vehicleId, driverId, hubId } = query
    const skip = (page - 1) * limit
    const take = limit

    const whereClause: Prisma.TripWhereInput = {
      ...(status && { status }),
      ...(vehicleId && { vehicleId }),
      ...(driverId && { driverId }),
      ...(hubId && { vehicle: { hubId } }),
    }

    const [totalItems, data] = await Promise.all([
      this.prismaService.trip.count({ where: whereClause }),
      this.prismaService.trip.findMany({
        where: whereClause,
        select: {
          id: true,
          vehicleId: true,
          driverId: true,
          status: true,
          startTime: true,
          endTime: true,
          totalDistance: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              stops: {
                where: {
                  orderId: { not: null },
                },
              },
            },
          },
          driver: {
            select: {
              avatar: true,
              fullName: true,
              id: true,
            },
          },
          vehicle: {
            select: {
              hubId: true,
              id: true,
              isActive: true,
              licensePlate: true,
              type: true,
            },
          },
        },
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ])

    return {
      totalItems,
      data: data.map(({ _count, driver, vehicle, ...trip }) => ({
        ...trip,
        driver,
        driverName: driver.fullName,
        orderCount: _count.stops,
        vehicle,
        vehicleLicensePlate: vehicle.licensePlate,
      })),
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit),
    }
  }

  /**
   * Retrieves details of a single trip, including driver, vehicle, and sorted stop sequences.
   *
   * Lấy chi tiết của một chuyến đi đơn lẻ, bao gồm tài xế, phương tiện và chuỗi các điểm dừng đã được sắp xếp.
   *
   * @param id The unique identifier of the trip.
   *           Mã định danh duy nhất của chuyến đi.
   * @returns A promise resolving to the complete trip data or null.
   *          Một promise trả về dữ liệu chuyến đi đầy đủ hoặc null.
   */
  async findById(id: number) {
    return this.prismaService.trip.findUnique({
      where: { id },
      include: {
        stops: {
          orderBy: { stopSequence: 'asc' }, // Trả về đã sort sẵn cho giao diện dễ render
          include: {
            hub: true,
            order: {
              include: {
                payment: {
                  select: {
                    amount: true,
                    method: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        vehicle: true,
        driver: true,
      },
    })
  }

  /**
   * Updates a trip's status and includes execution metadata.
   *
   * Cập nhật trạng thái chuyến đi cùng siêu dữ liệu thực thi.
   *
   * @param id Unique identifier of the trip.
   *           Mã định danh duy nhất của chuyến đi.
   * @param status The target TRIP_STATUS value.
   *               Giá trị TRIP_STATUS mục tiêu.
   * @param extraData Additional DB columns to update in the trip.
   *                  Các cột DB bổ sung cần cập nhật trong chuyến đi.
   * @returns A promise resolving to the updated trip details.
   *          Một promise trả về chi tiết chuyến đi đã cập nhật.
   */
  async updateTripStatus(id: number, status: keyof typeof TRIP_STATUS, extraData?: Prisma.TripUpdateInput) {
    return this.prismaService.trip.update({
      where: { id },
      data: {
        status,
        ...extraData,
      },
      include: {
        driver: {
          select: {
            avatar: true,
            fullName: true,
            id: true,
          },
        },
        stops: {
          include: {
            order: {
              select: {
                currentHubId: true,
                id: true,
                preferredDeliveryTimeEnd: true,
                preferredDeliveryTimeStart: true,
                receiverAddress: true,
                receiverLat: true,
                receiverLng: true,
                receiverName: true,
                receiverPhone: true,
                senderAddress: true,
                senderLat: true,
                senderLng: true,
                status: true,
                totalVolume: true,
                totalWeight: true,
                trackingCode: true,
              },
            },
          },
          orderBy: { stopSequence: 'asc' },
        },
        vehicle: {
          select: {
            capacityVolume: true,
            capacityWeight: true,
            emissionRatePerKm: true,
            fuelType: true,
            hubId: true,
            id: true,
            isActive: true,
            licensePlate: true,
            type: true,
          },
        },
      },
    })
  }

  /**
   * Cancels a specific order from an active trip (Mid-Trip Cancellation).
   * Inside transaction, deletes associated stops, sets order to CANCELLED/detached,
   * reindexes remaining stop sequences, and cancels the entire trip if no orders remain.
   *
   * Hủy một đơn hàng cụ thể khỏi một chuyến đi đang hoạt động (Hủy giữa chặng).
   * Trong giao dịch transaction, xóa các điểm dừng liên quan, đưa đơn về CANCELLED/tháo gỡ khỏi chuyến,
   * đánh lại thứ tự các điểm dừng còn lại và hủy toàn bộ chuyến đi nếu không còn đơn hàng nào.
   *
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @param orderId The unique identifier of the order to remove.
   *                Mã định danh duy nhất của đơn hàng cần loại bỏ.
   * @returns A promise resolving to cancellation status metadata.
   *          Một promise trả về siêu dữ liệu trạng thái hủy chuyến.
   */
  async cancelOrderFromTrip(tripId: number, orderId: number) {
    return this.prismaService.$transaction(async (tx) => {
      // 1. Xóa các TripStop liên quan đến đơn hủy (cả PICKUP lẫn DROPOFF/HUB_TRANSFER)
      await tx.tripStop.deleteMany({
        where: { tripId, orderId },
      })

      // 2. Chuyển Order sang CANCELLED, gỡ khỏi chuyến xe và ghi audit event
      await this.orderStateService.transitionOrderStatus({
        createdById: null,
        description: `Đơn hàng #${orderId} bị hủy khỏi chuyến #${tripId}.`,
        nextOrderData: {
          currentTripId: null,
        },
        orderId,
        source: EVENT_SOURCE.SYSTEM,
        status: ORDER_STATUS.CANCELLED,
        tx,
        validationMode: 'system',
      })

      // 3. Kiểm tra Trip còn stop nào có orderId không (bỏ qua Return-to-Depot)
      const remainingOrderStops = await tx.tripStop.findMany({
        where: { tripId, orderId: { not: null } },
        orderBy: { stopSequence: 'asc' },
      })

      if (remainingOrderStops.length === 0) {
        // Trip không còn đơn nào → hủy luôn Trip
        // Xóa stop Return-to-Depot còn sót
        await tx.tripStop.deleteMany({ where: { tripId } })
        await tx.trip.update({
          where: { id: tripId },
          data: { status: TRIP_STATUS.CANCELLED },
        })
        return { tripCancelled: true }
      }

      // 4. Reindex stopSequence để tránh lỗ hổng (1,2,_,4 → 1,2,3)
      const allRemainingStops = await tx.tripStop.findMany({
        where: { tripId },
        orderBy: { stopSequence: 'asc' },
      })

      for (let i = 0; i < allRemainingStops.length; i++) {
        if (allRemainingStops[i].stopSequence !== i + 1) {
          await tx.tripStop.update({
            where: { id: allRemainingStops[i].id },
            data: { stopSequence: i + 1 },
          })
        }
      }

      return { tripCancelled: false }
    })
  }
}
