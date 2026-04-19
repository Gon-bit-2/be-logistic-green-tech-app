import { SetMetadata } from '@nestjs/common'
import roleName from '../constants/role.constant'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: string[]) => {
  return SetMetadata(ROLES_KEY, roles)
}

export const IsAdmin = () => Roles(roleName.ADMIN)
export const IsCustomer = () => Roles(roleName.CUSTOMER)
export const IsDriver = () => Roles(roleName.DRIVER)
export const IsWarehouseStaff = () => Roles(roleName.WAREHOUSE_STAFF)
