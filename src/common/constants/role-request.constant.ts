export const RoleRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const

export type RoleRequestStatusValue = (typeof RoleRequestStatus)[keyof typeof RoleRequestStatus]
