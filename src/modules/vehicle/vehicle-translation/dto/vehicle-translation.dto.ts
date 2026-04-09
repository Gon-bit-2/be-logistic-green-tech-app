import { createZodDto } from 'nestjs-zod'
import {
  CreateVehicleTranslationBodySchema,
  DeleteVehicleTranslationParamsSchema,
  GetVehicleTranslationDetailSchema,
  GetVehicleTranslationParamsSchema,
  UpdateVehicleTranslationBodySchema,
} from '../model/vehicle-translation.model'

export class CreateVehicleTranslationBodyDTO extends createZodDto(CreateVehicleTranslationBodySchema) {}
export class UpdateVehicleTranslationBodyDTO extends createZodDto(UpdateVehicleTranslationBodySchema) {}
export class GetVehicleTranslationDetailResDTO extends createZodDto(GetVehicleTranslationDetailSchema) {}
export class GetVehicleTranslationParamsDTO extends createZodDto(GetVehicleTranslationParamsSchema) {}
export class DeleteVehicleTranslationParamsDTO extends createZodDto(DeleteVehicleTranslationParamsSchema) {}
