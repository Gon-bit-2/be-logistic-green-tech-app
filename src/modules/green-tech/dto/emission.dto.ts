import { createZodDto } from 'nestjs-zod'
import {
  CalculateEmissionParamsSchema,
  CustomerGreenSummaryResSchema,
  EmissionLogListResponseSchema,
  EmissionLogResponseSchema,
  GreenTechDashboardResSchema,
  OrderFootprintResSchema,
} from '../model/emission.model'

export class CalculateEmissionParamsDto extends createZodDto(CalculateEmissionParamsSchema) {}
export class EmissionLogResponseDto extends createZodDto(EmissionLogResponseSchema, { codec: true }) {}
export class EmissionLogListResponseDto extends createZodDto(EmissionLogListResponseSchema, { codec: true }) {}
export class GreenTechDashboardResDto extends createZodDto(GreenTechDashboardResSchema) {}
export class OrderFootprintResDto extends createZodDto(OrderFootprintResSchema, { codec: true }) {}
export class CustomerGreenSummaryResDto extends createZodDto(CustomerGreenSummaryResSchema) {}
