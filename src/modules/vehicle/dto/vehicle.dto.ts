import { createZodDto } from 'nestjs-zod'
import {
  CreateVehicleBodySchema,
  GetAllVehiclesQuerySchema,
  GetAllVehiclesResSchema,
  GetVehicleDetailResSchema,
  GetVehicleParamsSchema,
  UpdateVehicleBodySchema,
} from 'src/modules/vehicle/model/vehicle.model'

export class GetAllVehiclesResDTO extends createZodDto(GetAllVehiclesResSchema, { codec: true }) {}
export class GetAllVehiclesQueryDTO extends createZodDto(GetAllVehiclesQuerySchema) {}
export class GetVehicleParamsDTO extends createZodDto(GetVehicleParamsSchema) {}
export class UpdateVehicleBodyDTO extends createZodDto(UpdateVehicleBodySchema) {}
export class CreateVehicleBodyDTO extends createZodDto(CreateVehicleBodySchema) {}
export class GetVehicleDetailResDTO extends createZodDto(GetVehicleDetailResSchema, { codec: true }) {}
