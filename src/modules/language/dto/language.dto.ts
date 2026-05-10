import { createZodDto } from 'nestjs-zod'
import {
  CreateLanguageSchema,
  GetLanguageDetailResSchema,
  GetLanguageParamsSchema,
  GetLanguageResSchema,
  UpdateLanguageSchema,
} from 'src/modules/language/model/language.model'

export class LanguageBodyDto extends createZodDto(CreateLanguageSchema) {}
export class LanguageUpdateBodyDto extends createZodDto(UpdateLanguageSchema) {}
export class GetLanguageResDTO extends createZodDto(GetLanguageResSchema, { codec: true }) {}
export class GetLanguageParamsDTO extends createZodDto(GetLanguageParamsSchema) {}
export class GetLanguageDetailResDTO extends createZodDto(GetLanguageDetailResSchema, { codec: true }) {}
