import { createZodDto } from 'nestjs-zod'
import {
  CreateTrackingEventSchema,
  GetTrackingTimelineQuerySchema,
  GetPublicTrackingParamsSchema,
  PublicTrackingTimelineResponseSchema,
  TrackingEventResponseSchema,
  TrackingTimelineResponseSchema,
} from '../model/tracking.model'

export class CreateTrackingEventDto extends createZodDto(CreateTrackingEventSchema, { codec: true }) {}

export class GetTrackingTimelineQueryDto extends createZodDto(GetTrackingTimelineQuerySchema) {}

export class GetPublicTrackingParamsDto extends createZodDto(GetPublicTrackingParamsSchema) {}

export class TrackingEventResponseDto extends createZodDto(TrackingEventResponseSchema, { codec: true }) {}

export class TrackingTimelineResponseDto extends createZodDto(TrackingTimelineResponseSchema, { codec: true }) {}

export class PublicTrackingTimelineResponseDto extends createZodDto(PublicTrackingTimelineResponseSchema, { codec: true }) {}
