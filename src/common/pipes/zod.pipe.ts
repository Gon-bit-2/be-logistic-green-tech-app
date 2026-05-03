import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common'
import { ZodError, type ZodSchema } from 'zod'

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema<unknown>) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body') {
      return value
    }
    try {
      const parsedValue = this.schema.parse(value)
      return parsedValue
    } catch (error: unknown) {
      throw new BadRequestException(error instanceof ZodError ? error.issues : error)
    }
  }
}
