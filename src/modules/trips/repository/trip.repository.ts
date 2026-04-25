import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { GetTripListQueryType, TripStopType } from 'src/modules/trips/model/trip.model'
import { TRIP_STATUS } from 'src/common/constants/strip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { Prisma } from 'generated/prisma'

@Injectable()
export class TripRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Truy vấn các đơn hàng sẵn sàng để gom chuyến:
   * - PENDING: Đơn mới tạo, chờ chuyến First-mile.
   * - ARRIVED_AT_HUB: Đơn liên tỉnh đã hoàn thành First-mile, về đến Hub đích,
   *   chờ dispatch Last-mile giao tận nhà người nhận.
   */
  async findPendingOrders(hubId?: number) {
    return this.prismaService.order.findMany({
      where: {
        status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
        deletedAt: null,
        currentTripId: null, // Chỉ lấy đơn chưa nằm trên xe nào
        ...(hubId ? { currentHubId: hubId } : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
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
      assignmentRequestToApproveId?: number | null
    },
  ) {
    return this.prismaService.$transaction(async (tx) => {
      // ====== OPTIMISTIC CONCURRENCY CHECK ======
      // Re-query các Order bên trong Transaction để kiểm tra chúng vẫn sẵn sàng dispatch
      const stillPendingOrders = await tx.order.findMany({
        where: {
          id: { in: orderIds },
          status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
          currentTripId: null,
        },
        select: { id: true },
      })

      const validOrderIds = stillPendingOrders.map((o) => o.id)

      // Nếu toàn bộ đơn đã bị worker khác giành hết → không tạo Trip rỗng
      if (validOrderIds.length === 0) {
        return null
      }

      // Lọc lại stopsData chỉ giữ những node thuộc các Order còn hợp lệ
      const validOrderIdSet = new Set(validOrderIds)
      const filteredStops = stopsData.filter(
        (stop) => stop.orderId === null || stop.orderId === undefined || validOrderIdSet.has(stop.orderId),
      )

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

      // 2. Chuyển trạng thái Order sang ASSIGNED và gán currentTripId
      await tx.order.updateMany({
        where: {
          id: { in: validOrderIds },
          status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
          currentTripId: null,
        },
        data: {
          status: ORDER_STATUS.ASSIGNED,
          currentTripId: trip.id,
        },
      })

      await tx.driverAssignmentRequest.updateMany({
        where: {
          orderId: { in: validOrderIds },
          status: 'PENDING',
          ...(options?.assignmentRequestToApproveId
            ? { id: { not: options.assignmentRequestToApproveId } }
            : {}),
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
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ])

    return {
      totalItems,
      data,
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
   * Hoàn thành chuyến xe và xử lý trạng thái đơn hàng theo loại TripStop.
   *
   * Logic nghiệp vụ quan trọng:
   * - Đơn có stop DROPOFF     → status = DELIVERED   (giao thành công tận nhà)
   * - Đơn có stop HUB_TRANSFER → status = ARRIVED_AT_HUB (hàng đã về kho, chờ chặng tiếp theo)
   *                              + reset currentTripId = null
   *                              + Tìm Hub đích gần nhất với receiverLat/Lng → gán currentHubId mới
   *                              → Đơn sẽ tự động xuất hiện trong lượt dispatch tiếp của Hub đích
   */
  async completeTrip(tripId: number, allHubs: { id: number; latitude: number; longitude: number }[]) {
    return this.prismaService.$transaction(async (tx) => {
      // 1. Cập nhật Trip status = COMPLETED
      const trip = await tx.trip.update({
        where: { id: tripId },
        data: {
          status: TRIP_STATUS.COMPLETED,
          endTime: new Date(),
        },
        include: {
          stops: { include: { order: true } },
        },
      })

      // 2. Phân loại đơn hàng theo loại stop
      const deliveredOrderIds: number[] = []
      const hubTransferOrders: {
        orderId: number
        receiverLat: number
        receiverLng: number
        totalVolume: number
      }[] = []

      for (const stop of trip.stops) {
        if (!stop.orderId || !stop.order) continue

        if (stop.stopType === 'DROPOFF') {
          deliveredOrderIds.push(stop.orderId)
        } else if (stop.stopType === 'HUB_TRANSFER') {
          hubTransferOrders.push({
            orderId: stop.orderId,
            receiverLat: stop.order.receiverLat,
            receiverLng: stop.order.receiverLng,
            totalVolume: stop.order.totalVolume,
          })
        }
      }

      // 3a. Đơn nội ô: Chuyển sang DELIVERED
      if (deliveredOrderIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: deliveredOrderIds } },
          data: {
            status: ORDER_STATUS.DELIVERED,
            currentTripId: null,
          },
        })
      }

      // 3b. Đơn liên tỉnh: Chuyển sang ARRIVED_AT_HUB + tìm Hub đích gần nhất
      for (const htOrder of hubTransferOrders) {
        // Tìm Hub gần nhất với nơi người nhận (Hub đích cho chặng tiếp theo)
        // ====== #9: HUB WAREHOUSE CAPACITY ======
        let nearestHubId: number | null = null
        let minDist = Infinity
        let backupHubId: number | null = null // Fallback nếu tất cả Hub đều đầy

        for (const hub of allHubs as any[]) {
          const dist =
            Math.pow(hub.latitude - htOrder.receiverLat, 2) + Math.pow(hub.longitude - htOrder.receiverLng, 2)

          // Lưu lại fallback phòng trường hợp thiên tai/dịch bệnh làm 100% Hub bị đầy
          if (dist < minDist) {
            backupHubId = hub.id
          }

          // Kiểm tra Capacity Hub (chặn ở mức 90% để chừa khoảng trống vận hành thực tế)
          const currentOccupiedVolume = hub.ordersCurrentlyHere.reduce((sum: number, o: any) => sum + o.totalVolume, 0)

          if (currentOccupiedVolume + htOrder.totalVolume > hub.capacityVolume * 0.9) {
            continue // Hub này đã đầy -> Pass qua xét Hub phụ cận xa hơn 1 chút
          }

          if (dist < minDist) {
            minDist = dist
            nearestHubId = hub.id
          }
        }

        // Nếu kẹt quá độ (mọi Hub đều > 90% capacity), đành thả đại vào Hub gần nhất
        if (!nearestHubId) {
          nearestHubId = backupHubId
        }

        await tx.order.update({
          where: { id: htOrder.orderId },
          data: {
            status: ORDER_STATUS.ARRIVED_AT_HUB,
            currentTripId: null, // Không còn trên xe nào
            currentHubId: nearestHubId, // Gán vào Hub đích → dispatch tiếp sẽ nhặt được
          },
        })
      }

      return trip
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

      // 2. Chuyển Order sang CANCELLED và gỡ khỏi chuyến xe
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: ORDER_STATUS.CANCELLED,
          currentTripId: null,
        },
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
