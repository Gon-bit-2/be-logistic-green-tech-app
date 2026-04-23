import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common'
import { TrackingService } from '../service/tracking.service'
import { CreateTrackingEventDto, GetTrackingTimelineQueryDto } from '../dto/tracking.dto'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { Auth, isPublic } from 'src/common/decorators/auth.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { AuthType } from 'src/common/constants/auth.constant'
import type { AccessTokenPayload } from 'src/types/jwt.type'

@Controller('tracking-events')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post()
  @Auth(AuthType.Bearer)
  @Roles(roleName.DRIVER, roleName.WAREHOUSE_STAFF, roleName.ADMIN)
  createEvent(@Body() payload: CreateTrackingEventDto, @ActiveUser() user: AccessTokenPayload) {
    return this.trackingService.createEvent(user, payload)
  }

  @Get()
  @Auth(AuthType.Bearer)
  getTimeline(@Query() query: GetTrackingTimelineQueryDto) {
    return this.trackingService.getTimeline(query.orderId)
  }

  @Get('public/:trackingCode')
  @isPublic()
  getPublicTimeline(@Param('trackingCode') trackingCode: string) {
    return this.trackingService.getPublicTimeline(trackingCode)
  }
}
