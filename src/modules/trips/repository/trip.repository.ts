import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { GetTripListQueryType, TripStopType } from 'src/modules/strips/model/trip.model'
import { TRIP_STATUS } from 'src/common/constants/strip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { Prisma } from 'generated/prisma'

@Injectable()
export class StripRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Truy vấn các đơn hàng PENDING.
   * Nếu có hubId thì chỉ lấy các đơn đang tồn tại trong Hub đó.
   */
  async findPendingOrders(hubId?: number) {
    return this.prismaService.order.findMany({
      where: {
        status: ORDER_STATUS.PENDING,
        deletedAt: null,
        ...(hubId ? { currentHubId: hubId } : {}),
      },
      orderBy: {
        createdAt: 'asc', // Ưu tiên đơn tạo trước
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
   * Khi Bin Packing xong và ra được kế hoạch di chuyển,
   * Lưu DB trong 1 Transaction để đảm bảo tính toàn vẹn dữ liệu.
   */
  async createTripWithStops(
    vehicleId: number,
    driverId: number,
    orderIds: number[],
    stopsData: Omit<TripStopType, 'id' | 'tripId'>[],
  ) {
    return this.prismaService.$transaction(async (tx) => {
      // 1. Tạo Trip và Bulk Create các TripStop
      const trip = await tx.trip.create({
        data: {
          vehicleId,
          driverId,
          status: TRIP_STATUS.PENDING,
          stops: {
            create: stopsData,
          },
        },
        include: {
          stops: true,
        },
      })

      // 2. Chuyển trạng thái Order sang ASSIGNED và gán currentTripId
      await tx.order.updateMany({
        where: {
          id: { in: orderIds },
        },
        data: {
          status: ORDER_STATUS.ASSIGNED,
          currentTripId: trip.id,
        },
      })

      return trip
    })
  }

  /**
   * Lấy danh sách Trip (có phân trang)
   */
  async findAll(query: GetTripListQueryType) {
    const { limit, page, status, vehicleId, driverId } = query
    const skip = (page - 1) * limit
    const take = limit

    const whereClause: Prisma.TripWhereInput = {
      ...(status && { status }),
      ...(vehicleId && { vehicleId }),
      ...(driverId && { driverId }),
    }

    const [totalItems, data] = await Promise.all([
      this.prismaService.trip.count({ where: whereClause }),
      this.prismaService.trip.findMany({
        where: whereClause,
        include: {
          stops: true,
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
            order: true,
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
    })
  }
}
