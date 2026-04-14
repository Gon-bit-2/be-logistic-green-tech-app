import { createZodDto } from 'nestjs-zod'
import { CreatePaymentIntentParamsSchema, ConfirmCODParamsSchema } from '../model/payment.model'

export class CreatePaymentIntentParamsDto extends createZodDto(CreatePaymentIntentParamsSchema) {}
export class ConfirmCODParamsDto extends createZodDto(ConfirmCODParamsSchema) {}
