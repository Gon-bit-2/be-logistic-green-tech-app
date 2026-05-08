import { createZodDto } from 'nestjs-zod'
import {
  GetNotificationsQuerySchema,
  GetNotificationsResSchema,
  NotificationPreferencesResSchema,
  NotificationParamsSchema,
  NotificationUnreadCountResSchema,
  UpdateNotificationPreferencesSchema,
} from '../model/notification.model'

export class GetNotificationsQueryDTO extends createZodDto(GetNotificationsQuerySchema) {}
export class GetNotificationsResDTO extends createZodDto(GetNotificationsResSchema) {}
export class NotificationParamsDTO extends createZodDto(NotificationParamsSchema) {}
export class NotificationUnreadCountResDTO extends createZodDto(NotificationUnreadCountResSchema) {}
export class NotificationPreferencesResDTO extends createZodDto(NotificationPreferencesResSchema) {}
export class UpdateNotificationPreferencesDTO extends createZodDto(UpdateNotificationPreferencesSchema) {}
