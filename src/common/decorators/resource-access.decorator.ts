import { SetMetadata } from '@nestjs/common'

export interface ResourceAccessOptions {
  model: 'order' | 'vehicle' | 'hub' | 'user' | 'trip'
  paramName?: string // Mặc định là 'id' (lấy từ params trên URL)
  ownerField?: string // Tên cột tham chiếu đến Id của user (VD: 'customerId', 'driverId') để check quyền sở hữu
  hubField?: string // Tên cột tham chiếu đến hubId (VD: 'currentHubId', 'hubId') để check quyền cho WAREHOUSE_STAFF
}

export const RESOURCE_ACCESS_KEY = 'resource_access'
/**
 * Decorator to enforce granular resource-level authorization checks.
 * Decorator để thực thi các kiểm tra ủy quyền chi tiết ở cấp độ tài nguyên.
 *
 * Configures details for the `ResourceAccessGuard` such as the target model, parameter name,
 * owner field, and hub field.
 * Cấu hình chi tiết cho `ResourceAccessGuard` như model mục tiêu, tên tham số,
 * trường chủ sở hữu và trường hub.
 *
 * @param {ResourceAccessOptions} options - Authorization rules for resource access.
 * @param {ResourceAccessOptions} options - Các quy tắc ủy quyền để truy cập tài nguyên.
 */
export const ResourceAccess = (options: ResourceAccessOptions) => SetMetadata(RESOURCE_ACCESS_KEY, options)
