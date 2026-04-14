import { createZodDto } from 'nestjs-zod'
import {
  CreateTrackingEventSchema,
  GetTrackingTimelineQuerySchema,
  GetPublicTrackingParamsSchema,
} from '../model/tracking.model'

export class CreateTrackingEventDto extends createZodDto(CreateTrackingEventSchema) {}

export class GetTrackingTimelineQueryDto extends createZodDto(GetTrackingTimelineQuerySchema) {}

export class GetPublicTrackingParamsDto extends createZodDto(GetPublicTrackingParamsSchema) {}
