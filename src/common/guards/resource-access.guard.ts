import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RESOURCE_ACCESS_KEY, ResourceAccessOptions } from '../decorators/resource-access.decorator'
import { PrismaService } from 'src/database/prisma.service'
import { REQUEST_USER_KEY } from '../constants/auth.constant'
import roleName from '../constants/role.constant'

@Injectable()
export class ResourceAccessGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<ResourceAccessOptions>(RESOURCE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!options) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request[REQUEST_USER_KEY]
    if (!user) {
      return false
    }

    // Admin bypass: Admin có quyền hạn truy cập mọi tài nguyên
    if (user.roleName === roleName.ADMIN) {
      return true
    }

    const { model, paramName = 'id', ownerField, hubField } = options
    const resourceId = parseInt(request.params[paramName], 10)

    if (isNaN(resourceId)) {
      return true // Bỏ qua nếu ko có ID hợp lệ (xử lý create/list)
    }

    // Lấy đối tượng table từ prisma dynamic
    // HACK: bypass typescript safety in library to dynamic call findUnique
    const dbDelegate = (this.prisma as any)[model]
    if (!dbDelegate || typeof dbDelegate.findUnique !== 'function') {
      throw new Error(`Invalid Prisma model: ${model}`)
    }

    const resource = await dbDelegate.findUnique({
      where: { id: resourceId },
    })

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
}
