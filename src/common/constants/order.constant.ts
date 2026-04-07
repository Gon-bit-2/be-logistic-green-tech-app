export const ORDER_STATUS = {
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  SHIPPED: 'SHIPPED',
  COMPLETED: 'COMPLETED',
  TO_RETURN: 'TO_RETURN',
  CANCELLED: 'CANCELLED',
} as const

export type OrderStatusType = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]
