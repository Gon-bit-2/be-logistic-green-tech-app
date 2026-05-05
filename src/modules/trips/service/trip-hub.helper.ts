import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import roleName from 'src/common/constants/role.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'

/**
 * Helper injectable chứa các hàm kiểm tra Hub scope & resource validation
 * dùng chung cho nhiều sub-service trong module Trips.
 *
 * Extract ra để tránh duplicate logic resolveHubScope, assertDispatchResourcesBelongToHub,
 * assertDriverAndVehicleAvailability, v.v. ở nhiều nơi.
 */
@Injectable()
export class TripHubHelper {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Xác định hubId hợp lệ dựa trên role của actor:
   * - WAREHOUSE_STAFF: Trả về hubId của staff (bắt buộc phải có)
   * - ADMIN: Sử dụng requestedHubId (bắt buộc phải truyền)
   */
  async resolveHubScope(requestedHubId: number | undefined, actor: AccessTokenPayload): Promise<number> {
    if (actor.roleName !== roleName.WAREHOUSE_STAFF) {
      if (!requestedHubId) {
        throw new BadRequestException('Cần chọn hub để điều phối chuyến')
      }
      return requestedHubId
    }

    const warehouseUser = await this.prismaService.user.findFirst({
      where: { id: actor.userId, deletedAt: null, isDeleted: false },
      select: { hubId: true },
    })

    if (!warehouseUser?.hubId) {
      throw new ForbiddenException('Error.PermissionDenied.UserHasNoHub')
    }

    if (requestedHubId && requestedHubId !== warehouseUser.hubId) {
      throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
    }

    return warehouseUser.hubId
  }

  /**
   * Xác định hubId cho Dispatch Board — Admin không cần truyền hubId,
   * sẽ tự lấy hub đầu tiên hoạt động.
   */
  async resolveDispatchHub(requestedHubId: number | undefined, actor: AccessTokenPayload): Promise<number> {
    if (actor.roleName === roleName.ADMIN && !requestedHubId) {
      const firstHub = await this.prismaService.hub.findFirst({
        where: { isActive: true, deletedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true },
      })

      if (!firstHub) {
        throw new NotFoundException('Không có Hub nào đang hoạt động trong hệ thống.')
      }

      return firstHub.id
    }

    return this.resolveHubScope(requestedHubId, actor)
  }

  /** Suy ra hubId từ thông tin Trip (qua vehicle.hubId hoặc order.currentHubId) */
  inferTripHubId(trip: {
    stops?: Array<{ order?: { currentHubId?: number | null } | null }>
    vehicle?: { hubId?: number | null } | null
  }): number | null {
    if (trip.vehicle?.hubId) {
      return trip.vehicle.hubId
    }

    return trip.stops?.find((stop) => stop.order?.currentHubId)?.order?.currentHubId ?? null
  }

  /**
   * Kiểm tra xe, tài xế, và các đơn hàng đều thuộc cùng Hub.
   * Đảm bảo tính toàn vẹn dữ liệu khi dispatch.
   */
  async assertDispatchResourcesBelongToHub(
    hubId: number,
    vehicleId: number,
    driverId: number,
    orderIds: number[],
  ): Promise<void> {
    const [vehicle, driver] = await Promise.all([
      this.prismaService.vehicle.findFirst({
        where: { id: vehicleId, deletedAt: null, isActive: true },
        select: { id: true, hubId: true },
      }),
      this.prismaService.user.findFirst({
        where: {
          id: driverId,
          deletedAt: null,
          isDeleted: false,
          role: { name: roleName.DRIVER },
        },
        select: { id: true, hubId: true },
      }),
    ])

    if (!vehicle) throw new NotFoundException(`Vehicle #${vehicleId} không tồn tại`)
    if (!driver) throw new NotFoundException(`Driver #${driverId} không tồn tại`)
    if (vehicle.hubId !== hubId) throw new BadRequestException('Xe không thuộc hub đang điều phối')
    if (driver.hubId !== hubId) throw new BadRequestException('Tài xế không thuộc hub đang điều phối')

    await this.assertOrdersBelongToHub(hubId, orderIds)
  }

  /** Kiểm tra tất cả đơn hàng thuộc cùng Hub */
  async assertOrdersBelongToHub(hubId: number, orderIds: number[]): Promise<void> {
    const orders = await this.prismaService.order.findMany({
      where: {
        id: { in: orderIds },
        deletedAt: null,
        status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
        currentTripId: null,
        ...DISPATCHABLE_PAYMENT_FILTER,
      },
      select: { id: true, currentHubId: true },
    })

    const validIds = new Set(orders.filter((order) => order.currentHubId === hubId).map((order) => order.id))
    const invalidIds = orderIds.filter((orderId) => !validIds.has(orderId))
    if (invalidIds.length) {
      throw new BadRequestException(`Đơn hàng không hợp lệ hoặc không thuộc hub: ${invalidIds.join(', ')}`)
    }
  }

  /**
   * Kiểm tra xe và tài xế không đang bận ở chuyến nào khác.
   * excludedTripId: loại trừ trip hiện tại (khi reassign vehicle cho trip đó).
   */
  async assertDriverAndVehicleAvailability(
    vehicleId: number,
    driverId: number,
    excludedTripId?: number,
  ): Promise<void> {
    const [activeVehicleTrip, activeDriverTrip] = await Promise.all([
      this.prismaService.trip.findFirst({
        where: {
          id: excludedTripId ? { not: excludedTripId } : undefined,
          status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
          vehicleId,
        },
        select: { id: true },
      }),
      this.prismaService.trip.findFirst({
        where: {
          driverId,
          id: excludedTripId ? { not: excludedTripId } : undefined,
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
  }

  /** Kiểm tra thanh toán hợp lệ để dispatch */
  isOrderPaymentReadyForDispatch(order: {
    payment?: { method?: string | null; status?: string | null } | null
  }): boolean {
    if (order.payment?.method === 'COD') return true
    return order.payment?.method === 'STRIPE' && order.payment.status === 'COMPLETED'
  }

  /** Assert payment sẵn sàng — throw nếu chưa hợp lệ */
  assertOrderPaymentReadyForDispatch(order: {
    id?: number | null
    trackingCode?: string | null
    payment?: { method?: string | null; status?: string | null } | null
  }): void {
    if (!this.isOrderPaymentReadyForDispatch(order)) {
      const orderLabel = order.trackingCode ?? `#${order.id ?? 'N/A'}`
      if (order.payment?.method === 'STRIPE' && order.payment.status !== 'COMPLETED') {
        throw new BadRequestException(
          `Đơn ${orderLabel} dùng Stripe và chưa thanh toán thành công nên chưa thể vận chuyển.`,
        )
      }
      throw new BadRequestException(`Đơn ${orderLabel} chưa đủ điều kiện thanh toán để đưa vào vận chuyển.`)
    }
  }

  /** Lấy thông tin driver (kiểm tra quyền DRIVER) */
  async getDriverScopeUser(actor: AccessTokenPayload) {
    if (actor.roleName !== roleName.DRIVER) {
      throw new ForbiddenException('Error.PermissionDenied.NotDriver')
    }

    const driver = await this.prismaService.user.findFirst({
      where: {
        id: actor.userId,
        deletedAt: null,
        isDeleted: false,
        role: { name: roleName.DRIVER },
      },
      select: { fullName: true, hubId: true, id: true },
    })

    return { ...driver, hubId: driver?.hubId ?? null }
  }

  /** Kiểm tra tài xế không đang có chuyến IN_PROGRESS */
  async assertDriverHasNoInProgressTrip(driverId: number): Promise<void> {
    const activeTrip = await this.prismaService.trip.findFirst({
      where: { driverId, status: TRIP_STATUS.IN_PROGRESS },
      select: { id: true },
    })

    if (activeTrip) {
      throw new BadRequestException(`Tài xế #${driverId} đang chạy chuyến #${activeTrip.id}, chưa thể xin thêm đơn.`)
    }
  }
}
