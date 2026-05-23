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

/**
 * Service managing capacity validation and constraints check for electric vehicles.
 * Service quản lý xác thực sức chứa và kiểm tra ràng buộc của xe điện.
 *
 * Ensures total weight and volume of assigned orders do not exceed physical vehicle limitations.
 * Đảm bảo tổng trọng lượng và thể tích của các đơn hàng được gán không vượt quá giới hạn vật lý của xe.
 */
@Injectable()
export class TripCapacityService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Validates if a set of new orders can fit into a vehicle, optionally including existing trip cargo.
   * Xác thực xem một tập hợp các đơn hàng mới có thể vừa với xe hay không, tùy chọn bao gồm cả hàng hóa hiện tại.
   *
   * @param {object} input - Vehicle ID, order IDs and optional existing Trip ID.
   * @param {object} input - ID xe, ID đơn hàng và ID chuyến đi hiện có tùy chọn.
   * @returns {Promise<TripCapacitySnapshot>} A snapshot of the updated capacity metrics.
   * @returns {Promise<TripCapacitySnapshot>} Ảnh chụp nhanh các chỉ số sức chứa đã cập nhật.
   * @throws {NotFoundException} If vehicle does not exist.
   * @throws {NotFoundException} Nếu phương tiện không tồn tại.
   * @throws {BadRequestException} If weight or volume bounds are exceeded, or orders are duplicates/invalid.
   * @throws {BadRequestException} Nếu vượt quá tải trọng/thể tích, hoặc đơn hàng bị trùng lặp/không khả dụng.
   */
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

  /**
   * Asserts if all active orders on an existing trip fit into a new targeted vehicle.
   * Xác nhận xem tất cả các đơn hàng đang hoạt động trên một chuyến đi hiện có có vừa với một xe mục tiêu mới hay không.
   *
   * @param {object} input - Trip ID and target Vehicle ID.
   * @param {object} input - ID chuyến đi và ID xe mục tiêu.
   * @returns {Promise<TripCapacitySnapshot>} A snapshot of the updated capacity metrics.
   * @returns {Promise<TripCapacitySnapshot>} Ảnh chụp nhanh các chỉ số sức chứa đã cập nhật.
   * @throws {NotFoundException} If vehicle is not found.
   * @throws {NotFoundException} Nếu không tìm thấy phương tiện.
   * @throws {BadRequestException} If existing cargo exceeds targeted vehicle capacity.
   * @throws {BadRequestException} Nếu hàng hóa hiện có vượt quá sức chứa của xe mục tiêu.
   */
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

  /**
   * Utility to check array of order IDs for uniqueness and presence.
   * Tiện ích kiểm tra tính duy nhất và sự tồn tại của mảng ID đơn hàng.
   *
   * @param {number[]} orderIds - Order IDs array.
   * @returns {number[]} Non-empty unique order IDs.
   */
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
