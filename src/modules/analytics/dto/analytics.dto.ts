import { createZodDto } from 'nestjs-zod'
import { GetAnalyticsQuerySchema } from '../model/analytics.model'

export class GetAnalyticsQueryDto extends createZodDto(GetAnalyticsQuerySchema) {}
