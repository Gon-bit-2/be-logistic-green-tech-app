/**
 * Tracking Event Types - Phân biệt loại sự kiện
 * Không phải mọi event đều thay đổi status (SCAN, NOTE...)
 */
export const TRACKING_EVENT_TYPE = {
  STATUS_CHANGE: 'STATUS_CHANGE',
  SCAN: 'SCAN',
  NOTE: 'NOTE',
  POD: 'POD',
  EXCEPTION: 'EXCEPTION',
  ETA_UPDATE: 'ETA_UPDATE',
} as const

/**
 * Event Source - Nguồn gốc sự kiện (audit trail)
 */
export const EVENT_SOURCE = {
  DRIVER_APP: 'DRIVER_APP',
  HUB_SCANNER: 'HUB_SCANNER',
  SYSTEM: 'SYSTEM',
  ADMIN_PORTAL: 'ADMIN_PORTAL',
  CUSTOMER_APP: 'CUSTOMER_APP',
} as const

/**
 * Failure Reason Code - Lý do giao hàng thất bại (chuẩn hóa ISO)
 */
export const FAILURE_REASON_CODE = {
  CUSTOMER_NOT_AVAILABLE: 'CUSTOMER_NOT_AVAILABLE',
  INCORRECT_ADDRESS: 'INCORRECT_ADDRESS',
  REFUSED_BY_CUSTOMER: 'REFUSED_BY_CUSTOMER',
  BUSINESS_CLOSED: 'BUSINESS_CLOSED',
  INACCESSIBLE_LOCATION: 'INACCESSIBLE_LOCATION',
  PACKAGE_DAMAGED: 'PACKAGE_DAMAGED',
  WEATHER_DELAY: 'WEATHER_DELAY',
  VEHICLE_BREAKDOWN: 'VEHICLE_BREAKDOWN',
  OTHER: 'OTHER',
} as const

/**
 * Package Condition - Tình trạng kiện hàng khi giao
 */
export const PACKAGE_CONDITION = {
  INTACT: 'INTACT',
  DAMAGED: 'DAMAGED',
  PARTIAL: 'PARTIAL',
} as const

/**
 * Proof Image Type - Loại ảnh POD
 */
export const PROOF_IMAGE_TYPE = {
  PACKAGE: 'PACKAGE',
  SIGNATURE: 'SIGNATURE',
  DELIVERY_LOCATION: 'DELIVERY_LOCATION',
  DAMAGE_EVIDENCE: 'DAMAGE_EVIDENCE',
  FAILED_ATTEMPT: 'FAILED_ATTEMPT',
} as const

/**
 * State Machine - Bảng chuyển trạng thái đơn hàng hợp lệ (Whitelist)
 * Key = trạng thái hiện tại, Value = mảng trạng thái cho phép chuyển sang
 * Dựa trên quy trình vận chuyển logistics thực tế ở Việt Nam
 */
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['ARRIVED_AT_HUB', 'OUT_FOR_DELIVERY'],
  ARRIVED_AT_HUB: ['IN_TRANSIT'], // Re-dispatch: hàng từ kho lên chành xe tiếp
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'], // Giao thành công hoặc hủy (sau 3 lần fail)
}

/** Số lần giao hàng tối đa trước khi hoàn */
export const MAX_DELIVERY_ATTEMPTS = 3

export type TrackingEventTypeValue = (typeof TRACKING_EVENT_TYPE)[keyof typeof TRACKING_EVENT_TYPE]
export type EventSourceValue = (typeof EVENT_SOURCE)[keyof typeof EVENT_SOURCE]
export type FailureReasonCodeValue = (typeof FAILURE_REASON_CODE)[keyof typeof FAILURE_REASON_CODE]
export type PackageConditionValue = (typeof PACKAGE_CONDITION)[keyof typeof PACKAGE_CONDITION]
export type ProofImageTypeValue = (typeof PROOF_IMAGE_TYPE)[keyof typeof PROOF_IMAGE_TYPE]
