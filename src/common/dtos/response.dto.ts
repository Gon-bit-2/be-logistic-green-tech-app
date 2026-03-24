import { createZodDto } from 'nestjs-zod'
import { MessageResSchema } from 'src/common/model/response.model'

export class MessageResDTO extends createZodDto(MessageResSchema) {}
