import { createZodDto } from 'nestjs-zod'
import {
  DashboardSummaryResSchema,
  EmissionsAnalyticsResSchema,
  FleetPerformanceResSchema,
  GetAnalyticsQuerySchema,
  OrderAnalyticsResSchema,
  SlaAnalyticsResSchema,
} from '../model/analytics.model'

export class GetAnalyticsQueryDto extends createZodDto(GetAnalyticsQuerySchema) {}
export class DashboardSummaryResDto extends createZodDto(DashboardSummaryResSchema) {}
export class OrderAnalyticsResDto extends createZodDto(OrderAnalyticsResSchema) {}
export class EmissionsAnalyticsResDto extends createZodDto(EmissionsAnalyticsResSchema) {}
export class FleetPerformanceResDto extends createZodDto(FleetPerformanceResSchema) {}
export class SlaAnalyticsResDto extends createZodDto(SlaAnalyticsResSchema) {}
