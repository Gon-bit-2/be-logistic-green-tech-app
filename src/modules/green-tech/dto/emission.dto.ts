import { createZodDto } from 'nestjs-zod'
import { CalculateEmissionParamsSchema } from '../model/emission.model'

export class CalculateEmissionParamsDto extends createZodDto(CalculateEmissionParamsSchema) {}
