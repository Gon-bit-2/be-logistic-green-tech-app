import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common'
import { TrackingService } from '../service/tracking.service'
import {
  CreateTrackingEventDto,
  GetTrackingTimelineQueryDto,
  PublicTrackingTimelineResponseDto,
  TrackingEventResponseDto,
  TrackingTimelineResponseDto,
} from '../dto/tracking.dto'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { Auth, isPublic } from 'src/common/decorators/auth.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { AuthType } from 'src/common/constants/auth.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { ZodSerializerDto } from 'nestjs-zod'

/**
 * Controller managing package tracking events and journey timelines.
 * Provides APIs for recording new tracking events and fetching timelines for authenticated or public users.
 *
 * Controller quản lý các sự kiện định vị đơn hàng và dòng thời gian hành trình.
 * Cung cấp các API để ghi lại sự kiện định vị mới và truy xuất dòng thời gian cho người dùng đã xác thực hoặc công khai.
 */
@Controller('tracking-events')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  /**
   * Creates a new package tracking event. Restricted to Drivers, Warehouse Staff, and Admins.
   *
   * Tạo một sự kiện định vị đơn hàng mới. Chỉ giới hạn cho Tài xế, Nhân viên kho và Admin.
   *
   * @param payload The tracking event creation payload.
   *                Payload tạo sự kiện định vị đơn hàng.
   * @param user The token payload of the authenticated user performing the action.
   *             Thông tin token của người dùng đã xác thực thực hiện hành động.
   * @returns A promise resolving to the created tracking event details.
   *          Một promise trả về chi tiết sự kiện định vị đã tạo.
   */
  @Post()
  @Auth(AuthType.Bearer)
  @Roles(roleName.DRIVER, roleName.WAREHOUSE_STAFF, roleName.ADMIN)
  @ZodSerializerDto(TrackingEventResponseDto)
  createEvent(@Body() payload: CreateTrackingEventDto, @ActiveUser() user: AccessTokenPayload) {
    return this.trackingService.createEvent(user, payload)
  }

  /**
   * Retrieves the comprehensive tracking timeline of an order for authenticated users with permission.
   *
   * Lấy dòng thời gian định vị chi tiết của một đơn hàng cho người dùng đã xác thực có quyền truy cập.
   *
   * @param query The query containing the target order ID.
   *              Truy vấn chứa ID đơn hàng mục tiêu.
   * @param user The token payload of the authenticated user making the request.
   *             Thông tin token của người dùng đã xác thực thực hiện yêu cầu.
   * @returns A promise resolving to the detailed tracking timeline.
   *          Một promise trả về dòng thời gian định vị chi tiết.
   */
  @Get()
  @Auth(AuthType.Bearer)
  @ZodSerializerDto(TrackingTimelineResponseDto)
  getTimeline(@Query() query: GetTrackingTimelineQueryDto, @ActiveUser() user: AccessTokenPayload) {
    return this.trackingService.getTimeline(query.orderId, user)
  }

  /**
   * Public API to retrieve a simplified package tracking timeline using its unique public tracking code.
   *
   * API công khai để truy xuất dòng thời gian định vị đơn hàng rút gọn bằng mã tra cứu công khai duy nhất.
   *
   * @param trackingCode The unique public tracking code of the order.
   *                     Mã tra cứu công khai duy nhất của đơn hàng.
   * @returns A promise resolving to the public-friendly tracking timeline.
   *          Một promise trả về dòng thời gian định vị công khai thân thiện.
   */
  @Get('public/:trackingCode')
  @isPublic()
  @ZodSerializerDto(PublicTrackingTimelineResponseDto)
  getPublicTimeline(@Param('trackingCode') trackingCode: string) {
    return this.trackingService.getPublicTimeline(trackingCode)
  }
}
