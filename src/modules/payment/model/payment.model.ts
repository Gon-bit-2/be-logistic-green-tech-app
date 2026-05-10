import { z } from 'zod'
import { DecimalNumberSchema } from 'src/common/utils/decimal.util'
import { IsoDateTimeCodec } from 'src/common/utils/date-codec.util'

export const PaymentMethodSchema = z.enum(['STRIPE', 'COD'])
export const PaymentStatusSchema = z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'])

export const CreatePaymentIntentParamsSchema = z.object({
  orderId: z.coerce.number().int().positive(),
})

export const ConfirmCODParamsSchema = z.object({
  orderId: z.coerce.number().int().positive(),
})

export const PaymentResponseSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  amount: DecimalNumberSchema,
  method: PaymentMethodSchema,
  status: PaymentStatusSchema,
  transactionId: z.string().nullable(),
  paidAt: IsoDateTimeCodec.nullable(),
  createdAt: IsoDateTimeCodec,
})

export const CreatePaymentIntentResSchema = z.object({
  amount: z.number(),
  clientSecret: z.string().nullable(),
  transactionId: z.string(),
})

export const StripeWebhookResSchema = z.object({
  received: z.boolean(),
})

export const ConfirmCODResSchema = z.object({
  message: z.string(),
  success: z.boolean(),
})

export type CreatePaymentIntentParamsType = z.infer<typeof CreatePaymentIntentParamsSchema>
export type ConfirmCODParamsType = z.infer<typeof ConfirmCODParamsSchema>
export type PaymentResponseType = z.infer<typeof PaymentResponseSchema>
export type CreatePaymentIntentResType = z.infer<typeof CreatePaymentIntentResSchema>
export type StripeWebhookResType = z.infer<typeof StripeWebhookResSchema>
export type ConfirmCODResType = z.infer<typeof ConfirmCODResSchema>
