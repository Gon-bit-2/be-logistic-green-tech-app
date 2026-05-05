import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { ORDER_STATUS } from 'src/common/constants/order.constant'

export type TripCapacitySnapshot = {
  capacityVolume: number
  capacityWeight: number
  existingVolume: number
  existingWeight: number
  newVolume: number
  newWeight: number
  totalVolume: number
  totalWeight: number
  vehicleId: number
}

@Injectable()
export class TripCapacityService {
  constructor(private readonly prismaService: PrismaService) {}

  async assertVehicleCapacityForOrders(input: {
    existingTripId?: number
    orderIds: number[]
    vehicleId: number
  }): Promise<TripCapacitySnapshot> {
    const orderIds = this.assertUniqueOrderIds(input.orderIds)

    const [vehicle, newOrders, existingTripStops] = await Promise.all([
      this.prismaService.vehicle.findFirst({
        where: { id: input.vehicleId, deletedAt: null, isActive: true },
        select: { capacityVolume: true, capacityWeight: true, id: true },
      }),
      this.prismaService.order.findMany({
        where: {
          deletedAt: null,
          id: { in: orderIds },
          status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
        },
        select: { id: true, totalVolume: true, totalWeight: true },
      }),
      input.existingTripId
        ? this.prismaService.tripStop.findMany({
            where: {
              orderId: { not: null },
              tripId: input.existingTripId,
            },
            select: {
              orderId: true,
              order: {
                select: {
                  status: true,
                  totalVolume: true,
                  totalWeight: true,
                },
              },
            },
          })
        : Promise.resolve(
            [] as {
              order: { status: string; totalVolume: number; totalWeight: number } | null
              orderId: number | null
            }[],
          ),
    ])

    if (!vehicle) {
      throw new NotFoundException(`Vehicle #${input.vehicleId} không tồn tại`)
    }

    const foundOrderIds = new Set(newOrders.map((order) => order.id))
    const missingOrderIds = orderIds.filter((orderId) => !foundOrderIds.has(orderId))
    if (missingOrderIds.length) {
      throw new BadRequestException(`Đơn hàng không còn khả dụng để kiểm tra tải: ${missingOrderIds.join(', ')}`)
    }

    const existingOrderIds = new Set(
      existingTripStops.map((stop) => stop.orderId).filter((orderId): orderId is number => orderId != null),
    )
    const duplicateInTrip = orderIds.filter((orderId) => existingOrderIds.has(orderId))
    if (duplicateInTrip.length) {
      throw new BadRequestException(`Đơn hàng đã nằm trong chuyến: ${duplicateInTrip.join(', ')}`)
    }

    const activeExistingOrders = existingTripStops.filter((stop) => stop.order?.status !== ORDER_STATUS.CANCELLED)
    const existingWeight = activeExistingOrders.reduce((sum, stop) => sum + (stop.order?.totalWeight ?? 0), 0)
    const existingVolume = activeExistingOrders.reduce((sum, stop) => sum + (stop.order?.totalVolume ?? 0), 0)
    const newWeight = newOrders.reduce((sum, order) => sum + order.totalWeight, 0)
    const newVolume = newOrders.reduce((sum, order) => sum + order.totalVolume, 0)
    const totalWeight = existingWeight + newWeight
    const totalVolume = existingVolume + newVolume

    if (totalWeight > vehicle.capacityWeight) {
      throw new BadRequestException(
        `Tổng trọng lượng mới (${totalWeight}kg) sẽ vượt quá tải trọng xe (${vehicle.capacityWeight}kg)`,
      )
    }

    if (totalVolume > vehicle.capacityVolume) {
      throw new BadRequestException(
        `Tổng thể tích mới (${totalVolume}m3) sẽ vượt quá sức chứa xe (${vehicle.capacityVolume}m3)`,
      )
    }

    return {
      capacityVolume: vehicle.capacityVolume,
      capacityWeight: vehicle.capacityWeight,
      existingVolume,
      existingWeight,
      newVolume,
      newWeight,
      totalVolume,
      totalWeight,
      vehicleId: vehicle.id,
    }
  }

  async assertVehicleCapacityForTrip(input: { tripId: number; vehicleId: number }): Promise<TripCapacitySnapshot> {
    const [vehicle, existingTripStops] = await Promise.all([
      this.prismaService.vehicle.findFirst({
        where: { id: input.vehicleId, deletedAt: null, isActive: true },
        select: { capacityVolume: true, capacityWeight: true, id: true },
      }),
      this.prismaService.tripStop.findMany({
        where: {
          orderId: { not: null },
          tripId: input.tripId,
        },
        select: {
          orderId: true,
          order: {
            select: {
              status: true,
              totalVolume: true,
              totalWeight: true,
            },
          },
        },
      }),
    ])

    if (!vehicle) {
      throw new NotFoundException(`Vehicle #${input.vehicleId} không tồn tại`)
    }

    const activeExistingOrders = existingTripStops.filter((stop) => stop.order?.status !== ORDER_STATUS.CANCELLED)
    const existingWeight = activeExistingOrders.reduce((sum, stop) => sum + (stop.order?.totalWeight ?? 0), 0)
    const existingVolume = activeExistingOrders.reduce((sum, stop) => sum + (stop.order?.totalVolume ?? 0), 0)

    if (existingWeight > vehicle.capacityWeight) {
      throw new BadRequestException(
        `Tổng trọng lượng hiện có (${existingWeight}kg) sẽ vượt quá tải trọng xe (${vehicle.capacityWeight}kg)`,
      )
    }

    if (existingVolume > vehicle.capacityVolume) {
      throw new BadRequestException(
        `Tổng thể tích hiện có (${existingVolume}m3) sẽ vượt quá sức chứa xe (${vehicle.capacityVolume}m3)`,
      )
    }

    return {
      capacityVolume: vehicle.capacityVolume,
      capacityWeight: vehicle.capacityWeight,
      existingVolume,
      existingWeight,
      newVolume: 0,
      newWeight: 0,
      totalVolume: existingVolume,
      totalWeight: existingWeight,
      vehicleId: vehicle.id,
    }
  }

  private assertUniqueOrderIds(orderIds: number[]): number[] {
    const uniqueOrderIds = [...new Set(orderIds)]
    if (uniqueOrderIds.length !== orderIds.length) {
      throw new BadRequestException('Danh sách đơn hàng không được chứa trùng lặp.')
    }
    if (!uniqueOrderIds.length) {
      throw new BadRequestException('Cần chọn ít nhất một đơn hàng để kiểm tra tải.')
    }
    return uniqueOrderIds
  }
}
