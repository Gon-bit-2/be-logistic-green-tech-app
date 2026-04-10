import { createZodDto } from 'nestjs-zod'
import {
  CreateLanguageSchema,
  GetLanguageDetailResSchema,
  GetLanguageParamsSchema,
  GetLanguageResSchema,
  UpdateLanguageSchema,
} from '../language.model'

export class LanguageBodyDto extends createZodDto(CreateLanguageSchema) {}
export class LanguageUpdateBodyDto extends createZodDto(UpdateLanguageSchema) {}
export class GetLanguageResDTO extends createZodDto(GetLanguageResSchema) {}
export class GetLanguageParamsDTO extends createZodDto(GetLanguageParamsSchema) {}
export class GetLanguageDetailResDTO extends createZodDto(GetLanguageDetailResSchema) {}
