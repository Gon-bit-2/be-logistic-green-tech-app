import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import roleName from '../constants/role.constant'
import { RolesGuard } from 'src/common/guards/roles.guard'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: string[]) => {
  return applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(RolesGuard))
}

export const IsAdmin = () => Roles(roleName.ADMIN)
export const IsCustomer = () => Roles(roleName.CUSTOMER)
export const IsDriver = () => Roles(roleName.DRIVER)
export const IsWarehouseStaff = () => Roles(roleName.WAREHOUSE_STAFF)
