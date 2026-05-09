import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { GetTripListQueryType, TripStopType } from 'src/modules/trips/model/trip.model'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { Prisma } from 'generated/prisma'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { OrderStateService } from 'src/common/services/order-state.service'
import { EVENT_SOURCE, EventSourceValue } from 'src/common/constants/tracking.constant'

@Injectable()
export class TripRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly orderStateService: OrderStateService,
  ) {}

  /**
   * Truy vấn các đơn hàng sẵn sàng để gom chuyến:
   * - PENDING: Đơn mới tạo, chờ chuyến First-mile.
   * - ARRIVED_AT_HUB: Đơn liên tỉnh đã hoàn thành First-mile, về đến Hub đích,
   *   chờ dispatch Last-mile giao tận nhà người nhận.
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

  async countPendingOrders(hubId?: number) {
    return this.prismaService.order.count({
      where: this.buildPendingOrdersWhere(hubId),
    })
  }

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
   * Truy vấn các xe rảnh rỗi (không bị vướng vào Trip nào đang PENDING/IN_PROGRESS)
   * và sắp xếp ưu tiên xe tải điện (ELECTRIC_VAN).
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
   * Truy vấn các Tài xế rảnh rỗi:
   * - Có role = DRIVER
   * - Thuộc cùng Hub (nếu có hubId)
   * - Chưa bị xóa
   * - Không đang vướng chuyến xe nào (PENDING/IN_PROGRESS)
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
   * Khi Bin Packing xong và ra được kế hoạch di chuyển,
   * Lưu DB trong 1 Transaction để đảm bảo tính toàn vẹn dữ liệu.
   *
   * LỚP 3 (OPTIMISTIC CONCURRENCY CHECK):
   * Bên trong Transaction, re-verify lại rằng các Order vẫn ở trạng thái PENDING.
   * Nếu worker khác đã kịp gán trước (race condition), chỉ xử lý những đơn còn hợp lệ.
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
   * Lấy danh sách Trip (có phân trang)
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
   * Lấy chi tiết Trip
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
   * Cập nhật trạng thái chuyến xe (và có thể trigger event qua Service sau)
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
   * Hủy đơn hàng giữa chuyến xe (Mid-Trip Cancellation).
   *
   * Logic xử lý trong Transaction:
   * 1. Xóa các TripStop liên quan tới orderId bị hủy
   * 2. Reset Order: status → CANCELLED, currentTripId → null
   * 3. Reindex lại stopSequence cho các stop còn lại (tránh lỗ sequence 1,2,_,4)
   * 4. Nếu Trip không còn order nào → tự hủy Trip luôn
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
