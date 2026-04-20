import z from 'zod'
import roleName from 'src/common/constants/role.constant'
import { NotificationType } from 'src/common/constants/notification.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { PaginationQuerySchema } from 'src/common/model/request.model'
import { ORDER_STATUS } from 'src/common/constants/order.constant'

export const RoleRequestNotificationPayloadSchema = z
  .object({
    roleRequestId: z.number().int().positive(),
    targetRoleName: z.enum([roleName.DRIVER, roleName.WAREHOUSE_STAFF]),
    status: z.enum([RoleRequestStatus.PENDING, RoleRequestStatus.APPROVED, RoleRequestStatus.REJECTED]),
    reviewedById: z.number().int().positive().optional(),
  })
  .strict()

export const OrderNotificationPayloadSchema = z
  .object({
    orderId: z.number().int().positive(),
    trackingCode: z.string().min(1),
    orderStatus: z.enum([
      ORDER_STATUS.PENDING,
      ORDER_STATUS.OUT_FOR_DELIVERY,
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.CANCELLED,
    ]),
  })
  .strict()

export const NotificationPayloadSchema = z.union([RoleRequestNotificationPayloadSchema, OrderNotificationPayloadSchema])

export const NotificationSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  type: z.enum([
    NotificationType.ROLE_REQUEST_SUBMITTED,
    NotificationType.ROLE_REQUEST_APPROVED,
    NotificationType.ROLE_REQUEST_REJECTED,
    NotificationType.ORDER_CREATED,
    NotificationType.ORDER_OUT_FOR_DELIVERY,
    NotificationType.ORDER_DELIVERED,
    NotificationType.ORDER_CANCELLED,
  ]),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(1000),
  payload: NotificationPayloadSchema.nullable(),
  isRead: z.boolean(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
})

export const GetNotificationsQuerySchema = PaginationQuerySchema.extend({
  isRead: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
})

export const NotificationParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict()

export const GetNotificationsResSchema = z.object({
  data: z.array(NotificationSchema),
  totalItems: z.number().int().nonnegative(),
})

export const NotificationUnreadCountResSchema = z.object({
  totalUnread: z.number().int().nonnegative(),
})

export type NotificationPayloadType = z.infer<typeof NotificationPayloadSchema>
export type NotificationTypeModel = z.infer<typeof NotificationSchema>
export type GetNotificationsQueryType = z.infer<typeof GetNotificationsQuerySchema>
