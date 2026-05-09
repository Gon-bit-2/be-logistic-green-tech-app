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
export class EmissionLogResponseDto extends createZodDto(EmissionLogResponseSchema) {}
export class EmissionLogListResponseDto extends createZodDto(EmissionLogListResponseSchema) {}
export class GreenTechDashboardResDto extends createZodDto(GreenTechDashboardResSchema) {}
export class OrderFootprintResDto extends createZodDto(OrderFootprintResSchema) {}
export class CustomerGreenSummaryResDto extends createZodDto(CustomerGreenSummaryResSchema) {}
