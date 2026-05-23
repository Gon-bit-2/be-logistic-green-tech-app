import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { PrismaService } from 'src/database/prisma.service'

/**
 * Service managing security and access control for package tracking and location streaming.
 * Validates permission scopes based on user roles (Admin, Driver, Customer, Warehouse Staff)
 * for viewing timelines, creating tracking events, and joining real-time trip GPS tracking rooms.
 *
 * Dịch vụ quản lý bảo mật và kiểm soát quyền truy cập cho việc định vị đơn hàng và truyền tải dữ liệu vị trí.
 * Xác thực phạm vi quyền hạn dựa trên vai trò của người dùng (Admin, Tài xế, Khách hàng, Nhân viên kho)
 * đối với việc xem dòng thời gian, tạo sự kiện định vị và tham gia các phòng theo dõi GPS thời gian thực của chuyến đi.
 */
@Injectable()
export class TrackingAccessService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Asserts whether a user has permission to view an order's tracking timeline.
   *
   * Xác minh người dùng có quyền xem dòng thời gian định vị của một đơn hàng.
   *
   * @param actor The token payload of the user making the request.
   *              Thông tin token của người dùng thực hiện yêu cầu.
   * @param orderId The unique identifier of the order.
   *                Mã định danh duy nhất của đơn hàng.
   * @returns A promise resolving when validation succeeds.
   *          Một promise hoàn thành khi xác thực thành công.
   * @throws {ForbiddenException} If the user does not have permission to view the timeline.
   *                              Nếu người dùng không có quyền xem dòng thời gian này.
   */
  async assertCanViewOrderTimeline(actor: AccessTokenPayload, orderId: number): Promise<void> {
    const order = await this.getOrderAccessContext(orderId)
    if (actor.roleName === roleName.ADMIN) return

    if (actor.roleName === roleName.CUSTOMER && order.customerId === actor.userId) return

    if (actor.roleName === roleName.DRIVER && this.orderBelongsToDriver(order, actor.userId)) return

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveActorHubId(actor)
      if (hubId && this.orderBelongsToHub(order, hubId)) return
    }

    throw new ForbiddenException('Error.PermissionDenied.TrackingOrderScope')
  }

  /**
   * Asserts whether a user has permission to create a new tracking event for an order.
   *
   * Xác minh người dùng có quyền tạo một sự kiện định vị mới cho đơn hàng.
   *
   * @param actor The token payload of the user.
   *              Thông tin token của người dùng.
   * @param orderId The unique identifier of the order.
   *                Mã định danh duy nhất của đơn hàng.
   * @returns A promise resolving when validation succeeds.
   *          Một promise hoàn thành khi xác thực thành công.
   * @throws {ForbiddenException} If the user is not allowed to create a tracking event.
   *                              Nếu người dùng không được phép tạo sự kiện định vị.
   */
  async assertCanCreateTrackingEvent(actor: AccessTokenPayload, orderId: number): Promise<void> {
    const order = await this.getOrderAccessContext(orderId)
    if (actor.roleName === roleName.ADMIN) return

    if (actor.roleName === roleName.DRIVER && this.orderBelongsToDriver(order, actor.userId)) return

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveActorHubId(actor)
      if (hubId && this.orderBelongsToHub(order, hubId)) return
    }

    throw new ForbiddenException('Error.PermissionDenied.TrackingEventScope')
  }

  /**
   * Asserts whether a user has permission to join a real-time GPS tracking stream for a specific trip.
   *
   * Xác minh người dùng có quyền tham gia luồng theo dõi GPS thời gian thực cho một chuyến đi cụ thể.
   *
   * @param actor The token payload of the user.
   *              Thông tin token của người dùng.
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @returns A promise resolving when validation succeeds.
   *          Một promise hoàn thành khi xác thực thành công.
   * @throws {ForbiddenException} If the user is not authorized to join the tracking room.
   *                              Nếu người dùng không được ủy quyền tham gia phòng định vị.
   */
  async assertCanJoinTripTracking(actor: AccessTokenPayload, tripId: number): Promise<void> {
    const trip = await this.getTripAccessContext(tripId)
    if (actor.roleName === roleName.ADMIN) return

    if (actor.roleName === roleName.DRIVER && trip.driverId === actor.userId) return

    if (actor.roleName === roleName.CUSTOMER) {
      const hasCustomerOrder = trip.stops.some((stop) => stop.order?.customerId === actor.userId)
      if (hasCustomerOrder) return
    }

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveActorHubId(actor)
      if (hubId && trip.vehicle?.hubId === hubId) return
    }

    throw new ForbiddenException('Error.PermissionDenied.TrackingTripScope')
  }

  /**
   * Asserts whether the actor is the driver of the specified trip and is allowed to publish location coordinates.
   *
   * Xác minh tác nhân có phải là tài xế của chuyến đi được chỉ định và được phép phát tọa độ vị trí hay không.
   *
   * @param actor The token payload of the user.
   *              Thông tin token của người dùng.
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @returns A promise resolving when validation succeeds.
   *          Một promise hoàn thành khi xác thực thành công.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   * @throws {ForbiddenException} If the user is not the driver of this trip.
   *                              Nếu người dùng không phải là tài xế của chuyến đi này.
   */
  async assertCanPublishTripLocation(actor: AccessTokenPayload, tripId: number): Promise<void> {
    const trip = await this.prismaService.trip.findFirst({
      where: { id: tripId },
      select: { driverId: true, id: true },
    })

    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    }

    if (actor.roleName !== roleName.DRIVER || trip.driverId !== actor.userId) {
      throw new ForbiddenException('Error.PermissionDenied.NotTripDriver')
    }
  }

  /**
   * Fetches key metadata of an order to build access control context.
   *
   * Lấy siêu dữ liệu chính của một đơn hàng để xây dựng ngữ cảnh kiểm soát quyền truy cập.
   *
   * @param orderId The unique identifier of the order.
   *                Mã định danh duy nhất của đơn hàng.
   * @returns A promise resolving to the order access context object.
   *          Một promise trả về đối tượng ngữ cảnh truy cập đơn hàng.
   * @throws {NotFoundException} If the order does not exist.
   *                             Nếu đơn hàng không tồn tại.
   */
  private async getOrderAccessContext(orderId: number) {
    const order = await this.prismaService.order.findFirst({
      where: { deletedAt: null, id: orderId },
      select: {
        currentHubId: true,
        currentTrip: {
          select: {
            driverId: true,
            vehicle: { select: { hubId: true } },
          },
        },
        customerId: true,
        id: true,
        tripStops: {
          select: {
            trip: {
              select: {
                driverId: true,
                vehicle: { select: { hubId: true } },
              },
            },
          },
        },
      },
    })

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${orderId} không tồn tại`)
    }

    return order
  }

  /**
   * Fetches key metadata of a trip to build access control context.
   *
   * Lấy siêu dữ liệu chính của một chuyến đi để xây dựng ngữ cảnh kiểm soát quyền truy cập.
   *
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @returns A promise resolving to the trip access context object.
   *          Một promise trả về đối tượng ngữ cảnh truy cập chuyến đi.
   * @throws {NotFoundException} If the trip does not exist.
   *                             Nếu chuyến đi không tồn tại.
   */
  private async getTripAccessContext(tripId: number) {
    const trip = await this.prismaService.trip.findFirst({
      where: { id: tripId },
      select: {
        driverId: true,
        id: true,
        stops: {
          select: {
            order: {
              select: { customerId: true },
            },
          },
        },
        vehicle: {
          select: { hubId: true },
        },
      },
    })

    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    }

    return trip
  }

  /**
   * Helper function to check if the specified driver ID is linked to the order.
   *
   * Hàm hỗ trợ để kiểm tra xem ID tài xế được chỉ định có liên kết với đơn hàng hay không.
   *
   * @param order The order access context.
   *              Ngữ cảnh truy cập đơn hàng.
   * @param userId The ID of the driver.
   *               ID của tài xế.
   * @returns True if driver is linked, false otherwise.
   *          True nếu tài xế được liên kết, ngược lại false.
   */
  private orderBelongsToDriver(order: Awaited<ReturnType<TrackingAccessService['getOrderAccessContext']>>, userId: number) {
    if (order.currentTrip?.driverId === userId) return true
    return order.tripStops.some((stop) => stop.trip.driverId === userId)
  }

  /**
   * Helper function to check if the order is associated with the specified hub.
   *
   * Hàm hỗ trợ để kiểm tra xem đơn hàng có liên kết với hub được chỉ định hay không.
   *
   * @param order The order access context.
   *              Ngữ cảnh truy cập đơn hàng.
   * @param hubId The ID of the hub.
   *              ID của hub.
   * @returns True if associated, false otherwise.
   *          True nếu liên kết, ngược lại false.
   */
  private orderBelongsToHub(order: Awaited<ReturnType<TrackingAccessService['getOrderAccessContext']>>, hubId: number) {
    if (order.currentHubId === hubId) return true
    if (order.currentTrip?.vehicle?.hubId === hubId) return true
    return order.tripStops.some((stop) => stop.trip.vehicle?.hubId === hubId)
  }

  /**
   * Resolves the hub ID of the authenticated warehouse staff actor.
   *
   * Xác định hub ID của nhân viên kho đã xác thực.
   *
   * @param actor The token payload of the user.
   *              Thông tin token của người dùng.
   * @returns A promise resolving to the hub ID or null.
   *          Một promise trả về hub ID hoặc null.
   */
  private async resolveActorHubId(actor: AccessTokenPayload): Promise<number | null> {
    if (actor.hubId) return actor.hubId

    const user = await this.prismaService.user.findFirst({
      where: { deletedAt: null, id: actor.userId, isDeleted: false },
      select: { hubId: true },
    })

    return user?.hubId ?? null
  }
}
