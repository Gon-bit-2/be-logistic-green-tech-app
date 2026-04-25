export const DriverAssignmentRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const

export type DriverAssignmentRequestStatusValue =
  (typeof DriverAssignmentRequestStatus)[keyof typeof DriverAssignmentRequestStatus]
