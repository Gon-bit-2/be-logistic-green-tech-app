import { createZodDto } from 'nestjs-zod'
import {
  CreateTrackingEventSchema,
  GetTrackingTimelineQuerySchema,
  GetPublicTrackingParamsSchema,
  PublicTrackingTimelineResponseSchema,
  TrackingEventResponseSchema,
  TrackingTimelineResponseSchema,
} from '../model/tracking.model'

export class CreateTrackingEventDto extends createZodDto(CreateTrackingEventSchema) {}

export class GetTrackingTimelineQueryDto extends createZodDto(GetTrackingTimelineQuerySchema) {}

export class GetPublicTrackingParamsDto extends createZodDto(GetPublicTrackingParamsSchema) {}

export class TrackingEventResponseDto extends createZodDto(TrackingEventResponseSchema) {}

export class TrackingTimelineResponseDto extends createZodDto(TrackingTimelineResponseSchema) {}

export class PublicTrackingTimelineResponseDto extends createZodDto(PublicTrackingTimelineResponseSchema) {}
