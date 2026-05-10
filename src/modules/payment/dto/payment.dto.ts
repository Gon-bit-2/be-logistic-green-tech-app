import { createZodDto } from 'nestjs-zod'
import {
  ConfirmCODParamsSchema,
  ConfirmCODResSchema,
  CreatePaymentIntentParamsSchema,
  CreatePaymentIntentResSchema,
  PaymentResponseSchema,
  StripeWebhookResSchema,
} from '../model/payment.model'

export class CreatePaymentIntentParamsDto extends createZodDto(CreatePaymentIntentParamsSchema) {}
export class ConfirmCODParamsDto extends createZodDto(ConfirmCODParamsSchema) {}
export class CreatePaymentIntentResDto extends createZodDto(CreatePaymentIntentResSchema) {}
export class PaymentResponseDto extends createZodDto(PaymentResponseSchema, { codec: true }) {}
export class StripeWebhookResDto extends createZodDto(StripeWebhookResSchema) {}
export class ConfirmCODResDto extends createZodDto(ConfirmCODResSchema) {}
