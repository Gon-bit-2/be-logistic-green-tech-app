import { z } from 'zod'

const DateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

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

export const OutstandingCodQuerySchema = DateRangeSchema.extend({
  driverId: z.coerce.number().int().positive('Driver ID must be a positive integer').optional(),
})

export const ListSettlementBatchesQuerySchema = DateRangeSchema.extend({
  driverId: z.coerce.number().int().positive('Driver ID must be a positive integer').optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'COMPLETED', 'DISPUTED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const CreateSettlementBatchSchema = DateRangeSchema.extend({
  driverId: z.number().int().positive('Driver ID must be a positive integer'),
  note: z.string().max(1000).optional(),
  orderIds: z.array(z.number().int().positive()).optional(),
}).superRefine((value, ctx) => {
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'from must be before to',
      path: ['from'],
    })
  }
})

export const CompleteSettlementBatchSchema = z.object({
  note: z.string().max(1000).optional(),
})

export const DisputeSettlementBatchSchema = z.object({
  itemIds: z.array(z.number().int().positive()).optional(),
  reason: z.string().min(1, 'Dispute reason is required').max(1000),
})
