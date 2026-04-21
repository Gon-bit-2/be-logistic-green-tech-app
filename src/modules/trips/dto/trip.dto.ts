import { createZodDto } from 'nestjs-zod'
import {
  AutoDispatchQuerySchema,
  AutoDispatchResSchema,
  GetTripDetailResSchema,
  GetTripListQuerySchema,
  GetTripListResSchema,
  GetTripParamsSchema,
  CreateManualTripSchema,
  AssignVehicleSchema,
  AddOrdersToTripSchema,
} from '../model/trip.model'

export class GetTripListDto extends createZodDto(GetTripListQuerySchema) {}
export class GetTripListResDto extends createZodDto(GetTripListResSchema) {}
export class GetTripDetailResDto extends createZodDto(GetTripDetailResSchema) {}
export class AutoDispatchQueryDto extends createZodDto(AutoDispatchQuerySchema) {}
export class AutoDispatchResDto extends createZodDto(AutoDispatchResSchema) {}
export class GetTripParamsDto extends createZodDto(GetTripParamsSchema) {}
export class CreateManualTripDto extends createZodDto(CreateManualTripSchema) {}
export class AssignVehicleDto extends createZodDto(AssignVehicleSchema) {}
export class AddOrdersToTripDto extends createZodDto(AddOrdersToTripSchema) {}
