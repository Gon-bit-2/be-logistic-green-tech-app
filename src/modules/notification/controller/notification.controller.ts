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

/**
 * Controller managing user notifications and preferences.
 * Provides endpoints for retrieving notifications, checking unread counts,
 * marking messages as read, and updating notification settings.
 *
 * Controller quản lý thông báo của người dùng và các thiết lập ưu tiên.
 * Cung cấp các endpoint để lấy thông báo, kiểm tra số lượng tin chưa đọc,
 * đánh dấu tin nhắn đã đọc và cập nhật cài đặt thông báo.
 */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Retrieves a paginated list of notifications for the authenticated user.
   *
   * Lấy danh sách các thông báo có phân trang cho người dùng đã xác thực.
   *
   * @param userId The unique identifier of the active user.
   *               ID duy nhất của người dùng đang hoạt động.
   * @param query Paginated filter options (limit, page, isRead status).
   *              Các tùy chọn bộ lọc phân trang (giới hạn, trang, trạng thái đã đọc).
   * @returns A promise resolving to the user's notifications and pagination details.
   *          Một promise trả về danh sách thông báo của người dùng và chi tiết phân trang.
   */
  @Get()
  @ZodSerializerDto(GetNotificationsResDTO)
  findAll(@ActiveUser('userId') userId: number, @Query() query: GetNotificationsQueryDTO) {
    return this.notificationService.findAll(userId, query)
  }

  /**
   * Retrieves the total count of unread notifications for the active user.
   *
   * Lấy tổng số lượng thông báo chưa đọc của người dùng đang hoạt động.
   *
   * @param userId The unique identifier of the active user.
   *               ID duy nhất của người dùng đang hoạt động.
   * @returns A promise resolving to the unread count metadata.
   *          Một promise trả về siêu dữ liệu số lượng chưa đọc.
   */
  @Get('unread-count')
  @ZodSerializerDto(NotificationUnreadCountResDTO)
  getUnreadCount(@ActiveUser('userId') userId: number) {
    return this.notificationService.getUnreadCount(userId)
  }

  /**
   * Retrieves the notification channel preferences (in-app, email) for the active user.
   *
   * Lấy các thiết lập kênh thông báo ưu tiên (in-app, email) của người dùng đang hoạt động.
   *
   * @param userId The unique identifier of the active user.
   *               ID duy nhất của người dùng đang hoạt động.
   * @returns A promise resolving to the user's preference settings.
   *          Một promise trả về cài đặt kênh ưu tiên của người dùng.
   */
  @Get('preferences')
  @ZodSerializerDto(NotificationPreferencesResDTO)
  getPreferences(@ActiveUser('userId') userId: number) {
    return this.notificationService.getPreferences(userId)
  }

  /**
   * Updates the notification channel preferences (in-app, email) for the active user.
   *
   * Cập nhật các thiết lập kênh thông báo ưu tiên (in-app, email) của người dùng đang hoạt động.
   *
   * @param userId The unique identifier of the active user.
   *               ID duy nhất của người dùng đang hoạt động.
   * @param body The updated preferences data transfer object.
   *             Đối tượng truyền dữ liệu các ưu tiên đã cập nhật.
   * @returns A promise resolving to the revised preference settings.
   *          Một promise trả về cài đặt ưu tiên đã được sửa đổi.
   */
  @Patch('preferences')
  @ZodSerializerDto(NotificationPreferencesResDTO)
  updatePreferences(@ActiveUser('userId') userId: number, @Body() body: UpdateNotificationPreferencesDTO) {
    return this.notificationService.updatePreferences(userId, body)
  }

  /**
   * Marks all active notifications as read for the authenticated user.
   *
   * Đánh dấu tất cả thông báo hoạt động của người dùng đã xác thực là đã đọc.
   *
   * @param userId The unique identifier of the active user.
   *               ID duy nhất của người dùng đang hoạt động.
   * @returns A promise resolving to the operation message response.
   *          Một promise trả về thông điệp phản hồi hoạt động.
   */
  @Patch('read-all')
  @ZodSerializerDto(MessageResDTO)
  markAllAsRead(@ActiveUser('userId') userId: number) {
    return this.notificationService.markAllAsRead(userId)
  }

  /**
   * Marks a specific notification as read by its unique database ID.
   *
   * Đánh dấu một thông báo cụ thể là đã đọc theo ID cơ sở dữ liệu duy nhất của nó.
   *
   * @param userId The unique identifier of the active user.
   *               ID duy nhất của người dùng đang hoạt động.
   * @param id The unique identifier of the notification to mark as read.
   *           Mã định danh duy nhất của thông báo cần đánh dấu là đã đọc.
   * @returns A promise resolving to the operation message response.
   *          Một promise trả về thông điệp phản hồi hoạt động.
   */
  @Patch(':id/read')
  @ZodSerializerDto(MessageResDTO)
  markAsRead(@ActiveUser('userId') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.notificationService.markAsRead(userId, id)
  }
}
