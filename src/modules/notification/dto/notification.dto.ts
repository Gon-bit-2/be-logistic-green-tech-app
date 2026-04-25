import { createZodDto } from 'nestjs-zod'
import {
  GetNotificationsQuerySchema,
  GetNotificationsResSchema,
  NotificationParamsSchema,
  NotificationUnreadCountResSchema,
} from '../model/notification.model'

export class GetNotificationsQueryDTO extends createZodDto(GetNotificationsQuerySchema) {}
export class GetNotificationsResDTO extends createZodDto(GetNotificationsResSchema) {}
export class NotificationParamsDTO extends createZodDto(NotificationParamsSchema) {}
export class NotificationUnreadCountResDTO extends createZodDto(NotificationUnreadCountResSchema) {}
