import { createZodDto } from 'nestjs-zod'
import {
  CreateHubTranslationBodySchema,
  DeleteHubTranslationParamsSchema,
  GetHubTranslationDetailSchema,
  GetHubTranslationParamsSchema,
  UpdateHubTranslationBodySchema,
} from 'src/modules/hub/hub-translation/model/hub-translation.model'

export class CreateHubTranslationBodyDTO extends createZodDto(CreateHubTranslationBodySchema) {}
export class UpdateHubTranslationBodyDTO extends createZodDto(UpdateHubTranslationBodySchema) {}
export class GetHubTranslationDetailResDTO extends createZodDto(GetHubTranslationDetailSchema) {}
export class GetHubTranslationParamsDTO extends createZodDto(GetHubTranslationParamsSchema) {}
export class DeleteHubTranslationParamsDTO extends createZodDto(DeleteHubTranslationParamsSchema) {}
