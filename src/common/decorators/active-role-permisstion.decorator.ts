/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { REQUEST_ROLE_PERMISSIONS } from '../constants/auth.constant'
import { RolePermissionType } from '../model/share-role.model'

export const ActiveRolePermission = createParamDecorator(
  (field: keyof RolePermissionType | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    const rolePermission: RolePermissionType | undefined = request[REQUEST_ROLE_PERMISSIONS]
    return field ? rolePermission?.[field] : rolePermission
  },
)
