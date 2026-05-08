import { Body, Controller, Get, Param, Patch, ParseIntPipe, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { MessageResDTO } from 'src/common/dtos/response.dto'
import { NotificationService } from '../service/notification.service'
import {
  GetNotificationsQueryDTO,
  GetNotificationsResDTO,
  NotificationPreferencesResDTO,
  NotificationUnreadCountResDTO,
  UpdateNotificationPreferencesDTO,
} from '../dto/notification.dto'

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ZodSerializerDto(GetNotificationsResDTO)
  findAll(@ActiveUser('userId') userId: number, @Query() query: GetNotificationsQueryDTO) {
    return this.notificationService.findAll(userId, query)
  }

  @Get('unread-count')
  @ZodSerializerDto(NotificationUnreadCountResDTO)
  getUnreadCount(@ActiveUser('userId') userId: number) {
    return this.notificationService.getUnreadCount(userId)
  }

  @Get('preferences')
  @ZodSerializerDto(NotificationPreferencesResDTO)
  getPreferences(@ActiveUser('userId') userId: number) {
    return this.notificationService.getPreferences(userId)
  }

  @Patch('preferences')
  @ZodSerializerDto(NotificationPreferencesResDTO)
  updatePreferences(@ActiveUser('userId') userId: number, @Body() body: UpdateNotificationPreferencesDTO) {
    return this.notificationService.updatePreferences(userId, body)
  }

  @Patch('read-all')
  @ZodSerializerDto(MessageResDTO)
  markAllAsRead(@ActiveUser('userId') userId: number) {
    return this.notificationService.markAllAsRead(userId)
  }

  @Patch(':id/read')
  @ZodSerializerDto(MessageResDTO)
  markAsRead(@ActiveUser('userId') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.notificationService.markAsRead(userId, id)
  }
}
