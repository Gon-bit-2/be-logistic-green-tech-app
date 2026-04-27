import { SetMetadata } from '@nestjs/common'

export interface ResourceAccessOptions {
  model: 'order' | 'vehicle' | 'hub' | 'user' | 'trip'
  paramName?: string // Mặc định là 'id' (lấy từ params trên URL)
  ownerField?: string // Tên cột tham chiếu đến Id của user (VD: 'customerId', 'driverId') để check quyền sở hữu
  hubField?: string // Tên cột tham chiếu đến hubId (VD: 'currentHubId', 'hubId') để check quyền cho WAREHOUSE_STAFF
}

export const RESOURCE_ACCESS_KEY = 'resource_access'
export const ResourceAccess = (options: ResourceAccessOptions) => SetMetadata(RESOURCE_ACCESS_KEY, options)
