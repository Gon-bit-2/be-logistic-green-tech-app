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

@Controller('tracking-events')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post()
  @Auth(AuthType.Bearer)
  @Roles(roleName.DRIVER, roleName.WAREHOUSE_STAFF, roleName.ADMIN)
  @ZodSerializerDto(TrackingEventResponseDto)
  createEvent(@Body() payload: CreateTrackingEventDto, @ActiveUser() user: AccessTokenPayload) {
    return this.trackingService.createEvent(user, payload)
  }

  @Get()
  @Auth(AuthType.Bearer)
  @ZodSerializerDto(TrackingTimelineResponseDto)
  getTimeline(@Query() query: GetTrackingTimelineQueryDto, @ActiveUser() user: AccessTokenPayload) {
    return this.trackingService.getTimeline(query.orderId, user)
  }

  @Get('public/:trackingCode')
  @isPublic()
  @ZodSerializerDto(PublicTrackingTimelineResponseDto)
  getPublicTimeline(@Param('trackingCode') trackingCode: string) {
    return this.trackingService.getPublicTimeline(trackingCode)
  }
}
