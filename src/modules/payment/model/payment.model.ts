import { z } from 'zod'

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
  amount: z.number(), // Coerced from Decimal
  method: PaymentMethodSchema,
  status: PaymentStatusSchema,
  transactionId: z.string().nullable(),
  paidAt: z.date().nullable(),
  createdAt: z.date(),
})

export type CreatePaymentIntentParamsType = z.infer<typeof CreatePaymentIntentParamsSchema>
export type ConfirmCODParamsType = z.infer<typeof ConfirmCODParamsSchema>
export type PaymentResponseType = z.infer<typeof PaymentResponseSchema>
