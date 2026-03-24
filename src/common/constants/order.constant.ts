export const ORDER_STATUS = {
  UNPAID: 'UNPAID',
  READY_TO_SHIP: 'READY_TO_SHIP',
  SHIPPED: 'SHIPPED',
  COMPLETED: 'COMPLETED',
  TO_RETURN: 'TO_RETURN',
  CANCELLED: 'CANCELLED',
} as const

export type OrderStatusType = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]
