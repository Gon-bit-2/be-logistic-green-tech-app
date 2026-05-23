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
/**
 * Helper utility service containing common validations and scoping functions for Hubs and Trips.
 * Prevents logic duplication across different sub-services in the Trips module.
 *
 * Dịch vụ tiện ích hỗ trợ chứa các xác thực chung và các hàm giới hạn phạm vi cho Hub và Trip.
 * Ngăn chặn lặp lại logic giữa các dịch vụ con khác nhau trong module Trips.
 */
@Injectable()
export class TripHubHelper {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Resolves a valid hub ID based on the actor's role and requested hub scope.
   * Enforces warehouse staff to only operate within their assigned hub, and requires admins to explicitly specify one.
   *
   * Xác định hub ID hợp lệ dựa trên vai trò của người dùng và phạm vi hub được yêu cầu.
   * Bắt buộc nhân viên kho chỉ được thao tác trong hub được chỉ định, và yêu cầu admin phải truyền rõ hub ID.
   *
   * @param requestedHubId Optional hub ID requested by the user.
   *                       Hub ID tùy chọn do người dùng yêu cầu.
   * @param actor The token payload of the user making the request.
   *              Thông tin token của người dùng thực hiện yêu cầu.
   * @returns A promise resolving to the authorized hub ID.
   *          Một promise trả về hub ID được ủy quyền.
   * @throws {BadRequestException} If admin does not request a specific hub.
   *                               Nếu admin không chỉ định hub cụ thể.
   * @throws {ForbiddenException} If warehouse staff has no hub, or requests a hub other than their assigned one.
   *                              Nếu nhân viên kho không có hub, hoặc yêu cầu một hub khác với hub của họ.
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
   * Resolves the hub ID for the Dispatch Board.
   * Admins do not need to specify a hub ID; the first active hub in the system is selected by default.
   *
   * Xác định hub ID cho Dispatch Board (Bảng điều phối).
   * Admin không cần chỉ định hub ID; hub hoạt động đầu tiên trong hệ thống sẽ được chọn mặc định.
   *
   * @param requestedHubId Optional hub ID requested by the user.
   *                       Hub ID tùy chọn do người dùng yêu cầu.
   * @param actor The token payload of the user making the request.
   *              Thông tin token của người dùng thực hiện yêu cầu.
   * @returns A promise resolving to the authorized hub ID.
   *          Một promise trả về hub ID được ủy quyền.
   * @throws {NotFoundException} If no active hubs are found in the system.
   *                             Nếu không tìm thấy hub nào hoạt động trong hệ thống.
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

  /**
   * Infers the hub ID associated with a trip by examining its vehicle's hub or its stops' order hubs.
   *
   * Suy ra hub ID liên kết với chuyến đi bằng cách kiểm tra hub của xe hoặc hub của các đơn hàng trong điểm dừng.
   *
   * @param trip The trip data structure.
   *             Cấu trúc dữ liệu chuyến đi.
   * @returns The inferred hub ID, or null if it cannot be determined.
   *          Hub ID được suy ra, hoặc null nếu không thể xác định.
   */
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
   * Asserts that the vehicle, driver, and orders belong to the specified hub.
   * Enforces data integrity before dispatching a trip.
   *
   * Xác minh xe, tài xế và các đơn hàng đều thuộc cùng Hub được chỉ định.
   * Đảm bảo tính toàn vẹn dữ liệu trước khi điều phối chuyến đi.
   *
   * @param hubId The unique identifier of the hub.
   *              Mã định danh duy nhất của hub.
   * @param vehicleId The unique identifier of the vehicle.
   *                  Mã định danh duy nhất của phương tiện.
   * @param driverId The unique identifier of the driver user.
   *                 Mã định danh duy nhất của tài xế.
   * @param orderIds The list of order IDs to verify.
   *                 Danh sách ID đơn hàng cần xác minh.
   * @throws {NotFoundException} If vehicle or driver does not exist.
   *                             Nếu phương tiện hoặc tài xế không tồn tại.
   * @throws {BadRequestException} If resources do not match the assigned hub or orders are invalid.
   *                               Nếu tài nguyên không khớp với hub được chỉ định hoặc đơn hàng không hợp lệ.
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

  /**
   * Asserts that all specified order IDs exist, are in a dispatchable state, and belong to the correct hub.
   *
   * Xác minh tất cả ID đơn hàng được chỉ định đều tồn tại, ở trạng thái có thể điều phối, và thuộc đúng hub.
   *
   * @param hubId The unique identifier of the hub.
   *              Mã định danh duy nhất của hub.
   * @param orderIds The list of order IDs.
   *                 Danh sách ID đơn hàng.
   * @throws {BadRequestException} If any order is invalid, already assigned, or belongs to another hub.
   *                               Nếu bất kỳ đơn hàng nào không hợp lệ, đã được gán, hoặc thuộc về hub khác.
   */
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
   * Validates that both the driver and the vehicle are not already assigned to active trips (PENDING or IN_PROGRESS).
   *
   * Xác minh cả tài xế và phương tiện đều không bị trùng lịch ở chuyến đi đang hoạt động khác (PENDING hoặc IN_PROGRESS).
   *
   * @param vehicleId The ID of the vehicle.
   *                  ID của phương tiện.
   * @param driverId The ID of the driver.
   *                 ID của tài xế.
   * @param excludedTripId Optional trip ID to ignore (used during vehicle/driver reassignments).
   *                       ID chuyến đi tùy chọn cần bỏ qua (sử dụng khi chỉ định lại xe/tài xế).
   * @throws {BadRequestException} If driver or vehicle is occupied in another active trip.
   *                               Nếu tài xế hoặc phương tiện đang bận ở một chuyến đi hoạt động khác.
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

  /**
   * Checks whether the payment status of an order is ready for dispatch.
   * COD order is always ready, Stripe order requires COMPLETED payment status.
   *
   * Kiểm tra xem trạng thái thanh toán của đơn hàng có sẵn sàng để vận chuyển hay không.
   * Đơn COD luôn sẵn sàng, đơn Stripe yêu cầu trạng thái thanh toán COMPLETED.
   *
   * @param order The order's payment details.
   *              Chi tiết thanh toán của đơn hàng.
   * @returns True if payment is ready for dispatch, false otherwise.
   *          True nếu thanh toán đã sẵn sàng để vận chuyển, ngược lại false.
   */
  isOrderPaymentReadyForDispatch(order: {
    payment?: { method?: string | null; status?: string | null } | null
  }): boolean {
    if (order.payment?.method === 'COD') return true
    return order.payment?.method === 'STRIPE' && order.payment.status === 'COMPLETED'
  }

  /**
   * Asserts that an order payment is ready for dispatch. Throws an exception if not ready.
   *
   * Xác minh thanh toán đơn hàng sẵn sàng vận chuyển. Ném ra ngoại lệ nếu chưa sẵn sàng.
   *
   * @param order The order data structure.
   *              Cấu trúc dữ liệu đơn hàng.
   * @throws {BadRequestException} If payment is not ready or Stripe payment failed.
   *                               Nếu thanh toán chưa sẵn sàng hoặc thanh toán Stripe không thành công.
   */
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

  /**
   * Retrieves and scopes a driver user. Ensures that the actor is indeed a driver.
   *
   * Lấy thông tin và giới hạn tài xế. Đảm bảo người dùng thực sự có vai trò tài xế.
   *
   * @param actor The token payload of the user.
   *              Thông tin token của người dùng.
   * @returns A promise resolving to the scoped driver details.
   *          Một promise trả về chi tiết tài xế đã giới hạn phạm vi.
   * @throws {ForbiddenException} If the actor's role is not DRIVER.
   *                              Nếu vai trò người dùng không phải DRIVER.
   */
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

  /**
   * Validates that the driver does not have any ongoing IN_PROGRESS trips.
   *
   * Xác minh tài xế không có bất kỳ chuyến đi nào đang thực hiện (IN_PROGRESS).
   *
   * @param driverId The ID of the driver.
   *                 ID của tài xế.
   * @throws {BadRequestException} If the driver has an active trip.
   *                               Nếu tài xế đang chạy một chuyến đi khác.
   */
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
