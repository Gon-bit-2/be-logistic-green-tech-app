import z from 'zod'
import roleName from 'src/common/constants/role.constant'
import { NotificationType } from 'src/common/constants/notification.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { PaginationQuerySchema } from 'src/common/dtos/request.dto'
import { IsoDateTimeCodec } from 'src/common/utils/date-codec.util'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'

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

export const DriverAssignmentRequestNotificationPayloadSchema = z
  .object({
    assignmentRequestId: z.number().int().positive(),
    driverId: z.number().int().positive(),
    hubId: z.number().int().positive(),
    orderId: z.number().int().positive(),
    orderTrackingCode: z.string().min(1),
    reviewNote: z.string().min(1).max(1000).optional(),
    reviewedById: z.number().int().positive().optional(),
    status: z.enum([
      DriverAssignmentRequestStatus.PENDING,
      DriverAssignmentRequestStatus.APPROVED,
      DriverAssignmentRequestStatus.REJECTED,
      DriverAssignmentRequestStatus.CANCELLED,
    ]),
  })
  .strict()

export const NotificationPayloadSchema = z.union([
  RoleRequestNotificationPayloadSchema,
  OrderNotificationPayloadSchema,
  DriverAssignmentRequestNotificationPayloadSchema,
])

export const NotificationSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  type: z.enum([
    NotificationType.ROLE_REQUEST_SUBMITTED,
    NotificationType.ROLE_REQUEST_APPROVED,
    NotificationType.ROLE_REQUEST_REJECTED,
    NotificationType.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED,
    NotificationType.DRIVER_ASSIGNMENT_REQUEST_APPROVED,
    NotificationType.DRIVER_ASSIGNMENT_REQUEST_REJECTED,
    NotificationType.ORDER_CREATED,
    NotificationType.ORDER_OUT_FOR_DELIVERY,
    NotificationType.ORDER_DELIVERED,
    NotificationType.ORDER_CANCELLED,
    NotificationType.SLA_ALERT_CREATED,
    NotificationType.SLA_ALERT_RESOLVED,
    NotificationType.COD_COLLECTED,
    NotificationType.COD_SETTLEMENT_SUBMITTED,
    NotificationType.COD_SETTLEMENT_COMPLETED,
    NotificationType.COD_SETTLEMENT_DISPUTED,
  ]),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(1000),
  payload: z.union([NotificationPayloadSchema, z.record(z.string(), z.unknown())]).nullable(),
  isRead: z.boolean(),
  readAt: IsoDateTimeCodec.nullable(),
  createdAt: IsoDateTimeCodec,
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

export const NotificationPreferenceSchema = z.object({
  inAppEnabled: z.boolean(),
  type: NotificationSchema.shape.type,
})

export const NotificationPreferencesResSchema = z.object({
  data: z.array(NotificationPreferenceSchema),
})

export const UpdateNotificationPreferencesSchema = z
  .object({
    preferences: z.array(NotificationPreferenceSchema).min(1),
  })
  .strict()

export type NotificationPayloadType = z.infer<typeof NotificationPayloadSchema>
export type NotificationTypeModel = z.infer<typeof NotificationSchema>
export type GetNotificationsQueryType = z.infer<typeof GetNotificationsQuerySchema>
export type UpdateNotificationPreferencesType = z.infer<typeof UpdateNotificationPreferencesSchema>
