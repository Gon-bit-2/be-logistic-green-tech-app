import { SetMetadata } from '@nestjs/common'
import roleName from '../constants/role.constant'

export const ROLES_KEY = 'roles'
/**
 * Decorator to assign required user roles to a route or controller.
 * Decorator để gán các vai trò người dùng bắt buộc đối với một tuyến đường hoặc controller.
 *
 * @param {string[]} roles - List of authorized role names.
 * @param {string[]} roles - Danh sách tên các vai trò được phép.
 */
export const Roles = (...roles: string[]) => {
  return SetMetadata(ROLES_KEY, roles)
}

/**
 * Decorator helper to restrict route access exclusively to Administrators.
 * Decorator bổ trợ để giới hạn quyền truy cập tuyến đường độc quyền cho người quản trị (Admin).
 */
export const IsAdmin = () => Roles(roleName.ADMIN)

/**
 * Decorator helper to restrict route access exclusively to Customers.
 * Decorator bổ trợ để giới hạn quyền truy cập tuyến đường độc quyền cho khách hàng (Customer).
 */
export const IsCustomer = () => Roles(roleName.CUSTOMER)

/**
 * Decorator helper to restrict route access exclusively to Drivers.
 * Decorator bổ trợ để giới hạn quyền truy cập tuyến đường độc quyền cho tài xế (Driver).
 */
export const IsDriver = () => Roles(roleName.DRIVER)

/**
 * Decorator helper to restrict route access exclusively to Warehouse Staff.
 * Decorator bổ trợ để giới hạn quyền truy cập tuyến đường độc quyền cho nhân viên kho (Warehouse Staff).
 */
export const IsWarehouseStaff = () => Roles(roleName.WAREHOUSE_STAFF)
