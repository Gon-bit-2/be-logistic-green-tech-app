import { z } from 'zod'

export const AddCodSchema = z.object({
  orderId: z.number().int().positive('Order ID must be a positive integer'),
  amount: z.number().positive('Amount must be positive'),
})

export const ReconcileCodSchema = z.object({
  driverId: z.number().int().positive('Driver ID must be a positive integer'),
  amount: z.number().positive('Amount must be positive'),
  referenceId: z.string().min(1, 'Reference ID is required'),
  description: z.string().optional(),
})
