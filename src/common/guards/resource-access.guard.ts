import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RESOURCE_ACCESS_KEY, ResourceAccessOptions } from '../decorators/resource-access.decorator'
import { PrismaService } from 'src/database/prisma.service'
import { REQUEST_USER_KEY } from '../constants/auth.constant'
import roleName from '../constants/role.constant'
import type { AccessTokenPayload } from '../types/jwt.type'

type ResourceRecord = Record<string, unknown>

/**
 * Resource access authorization guard.
 * Guard ủy quyền truy cập tài nguyên.
 *
 * Enforces ownership and context rules on database resources (orders, trips, hubs, users, vehicles).
 * For example:
 * - Admin can access all resources.
 * - Customers/Drivers can only access resources they own.
 * - Warehouse staff can only access resources belonging to their assigned Hub.
 *
 * Thực thi các quy tắc sở hữu và bối cảnh trên tài nguyên cơ sở dữ liệu (đơn hàng, chuyến đi, hub, người dùng, xe).
 * Ví dụ:
 * - Admin có thể truy cập tất cả tài nguyên.
 * - Customer/Driver chỉ có thể truy cập tài nguyên do chính họ sở hữu.
 * - Nhân viên kho chỉ có thể truy cập tài nguyên thuộc Hub được phân công của họ.
 */
@Injectable()
export class ResourceAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  /**
   * Evaluates resource access permission for the incoming request.
   * Đánh giá quyền truy cập tài nguyên cho request gửi đến.
   *
   * Extracts decorator metadata, resolves the resource ID from request parameters,
   * queries the resource from the database, and validates ownership or hub membership.
   * Trích xuất metadata từ decorator, phân giải ID tài nguyên từ tham số request,
   * truy vấn tài nguyên từ cơ sở dữ liệu và xác thực quyền sở hữu hoặc tư cách thành viên hub.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {Promise<boolean>} Resolves to true if the user has access.
   * @returns {Promise<boolean>} Trả về Promise chứa true nếu người dùng có quyền truy cập.
   * @throws {NotFoundException} If the requested resource does not exist in the database.
   * @throws {NotFoundException} Nếu tài nguyên được yêu cầu không tồn tại trong cơ sở dữ liệu.
   * @throws {ForbiddenException} If access is denied due to ownership or hub mismatch.
   * @throws {ForbiddenException} Nếu quyền truy cập bị từ chối do không trùng khớp chủ sở hữu hoặc hub.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<ResourceAccessOptions>(RESOURCE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!options) {
      return true
    }

    const request = context.switchToHttp().getRequest<{
      params: Record<string, string | undefined>
      [REQUEST_USER_KEY]?: AccessTokenPayload
    }>()
    const user = request[REQUEST_USER_KEY]
    if (!user) {
      return false
    }

    // Admin bypass: Admin có quyền hạn truy cập mọi tài nguyên
    if (user.roleName === roleName.ADMIN) {
      return true
    }

    const { model, paramName = 'id', ownerField, hubField } = options
    const resourceId = parseInt(request.params[paramName] ?? '', 10)

    if (isNaN(resourceId)) {
      return true // Bỏ qua nếu ko có ID hợp lệ (xử lý create/list)
    }

    const resource = await this.findResource(model, resourceId)

    if (!resource) {
      throw new NotFoundException(`Resource not found`)
    }

    // Rule cho CUSTOMER: Chặn xem dữ liệu của customer khác
    // Rule cho DRIVER: Chặn xem dữ liệu của driver khác
    if ((user.roleName === roleName.CUSTOMER || user.roleName === roleName.DRIVER) && ownerField) {
      if (resource[ownerField] !== user.userId) {
        throw new ForbiddenException('Error.PermissionDenied.NotResourceOwner')
      }
    }

    // Rule cho WAREHOUSE_STAFF: Chặn thao tác trên HUB khác
    if (user.roleName === roleName.WAREHOUSE_STAFF && hubField) {
      if (!user.hubId || resource[hubField] !== user.hubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    return true
  }

  /**
   * Helper method to query a resource from the database by its ID based on model type.
   * Phương thức bổ trợ để truy vấn tài nguyên từ cơ sở dữ liệu bằng ID dựa trên loại model.
   *
   * @param {ResourceAccessOptions['model']} model - The Prisma model type to query (e.g., 'order', 'trip').
   * @param {ResourceAccessOptions['model']} model - Loại model Prisma cần truy vấn (ví dụ: 'order', 'trip').
   * @param {number} id - The primary key of the resource.
   * @param {number} id - Khóa chính của tài nguyên.
   * @returns {Promise<ResourceRecord | null>} The resource record object if found, otherwise null.
   * @returns {Promise<ResourceRecord | null>} Đối tượng bản ghi tài nguyên nếu tìm thấy, ngược lại là null.
   */
  private async findResource(model: ResourceAccessOptions['model'], id: number): Promise<ResourceRecord | null> {
    const loaders: Record<ResourceAccessOptions['model'], (id: number) => Promise<ResourceRecord | null>> = {
      hub: async (resourceId) => this.toResourceRecord(await this.prisma.hub.findUnique({ where: { id: resourceId } })),
      order: async (resourceId) =>
        this.toResourceRecord(await this.prisma.order.findUnique({ where: { id: resourceId } })),
      trip: async (resourceId) =>
        this.toResourceRecord(await this.prisma.trip.findUnique({ where: { id: resourceId } })),
      user: async (resourceId) =>
        this.toResourceRecord(await this.prisma.user.findUnique({ where: { id: resourceId } })),
      vehicle: async (resourceId) =>
        this.toResourceRecord(await this.prisma.vehicle.findUnique({ where: { id: resourceId } })),
    }

    return loaders[model](id)
  }

  /**
   * Helper utility to safely convert an object to a typed ResourceRecord map.
   * Tiện ích bổ trợ để chuyển đổi an toàn một đối tượng thành một map ResourceRecord có kiểu dữ liệu.
   *
   * @param {object | null} resource - The raw database object.
   * @param {object | null} resource - Đối tượng cơ sở dữ liệu thô.
   * @returns {ResourceRecord | null} The casted resource record, or null.
   * @returns {ResourceRecord | null} Bản ghi tài nguyên đã ép kiểu, hoặc null.
   */
  private toResourceRecord(resource: object | null): ResourceRecord | null {
    return resource ? { ...resource } : null
  }
}
