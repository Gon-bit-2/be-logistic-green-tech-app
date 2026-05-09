import { z } from 'zod'
import { DecimalNumberSchema } from 'src/common/utils/decimal.util'

export const WalletStatusSchema = z.enum(['ACTIVE', 'BLOCKED'])
export const TransactionTypeSchema = z.enum([
  'DEPOSIT',
  'WITHDRAWAL',
  'COD_COLLECTION',
  'COD_RECONCILIATION',
  'COMMISSION_FEE',
  'PENALTY',
])
export const TransactionStatusSchema = z.enum(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'])
export const CodSettlementBatchStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'COMPLETED', 'DISPUTED', 'CANCELLED'])
export const CodSettlementItemStatusSchema = z.enum(['PENDING', 'COMPLETED', 'DISPUTED', 'CANCELLED'])

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

export const WalletResponseSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  balance: DecimalNumberSchema,
  codCollected: DecimalNumberSchema,
  status: WalletStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const OutstandingCodOrderSchema = z.object({
  amount: z.number(),
  collectedAt: z.date(),
  orderId: z.number().int().positive(),
  trackingCode: z.string(),
  transactionId: z.number().int().positive(),
})

export const OutstandingCodOrderListSchema = z.array(OutstandingCodOrderSchema)

export const CodSettlementItemResponseSchema = z
  .object({
    amount: DecimalNumberSchema,
    batchId: z.number().int().positive(),
    createdAt: z.date(),
    disputeReason: z.string().nullable().optional(),
    id: z.number().int().positive(),
    order: z
      .object({
        codAmount: DecimalNumberSchema.nullable().optional(),
        codCollectedAt: z.date().nullable().optional(),
        codReconciledAt: z.date().nullable().optional(),
        id: z.number().int().positive(),
        payment: z
          .object({
            amount: DecimalNumberSchema,
            method: z.enum(['STRIPE', 'COD']),
            status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']),
          })
          .nullable()
          .optional(),
        trackingCode: z.string(),
      })
      .passthrough()
      .optional(),
    orderId: z.number().int().positive(),
    status: CodSettlementItemStatusSchema,
    transaction: z
      .object({
        id: z.number().int().positive(),
        referenceId: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    transactionId: z.number().int().positive().nullable().optional(),
    updatedAt: z.date(),
  })
  .passthrough()

export const CodSettlementBatchResponseSchema = z
  .object({
    batchCode: z.string(),
    cancelledAt: z.date().nullable().optional(),
    completedAt: z.date().nullable().optional(),
    completedById: z.number().int().positive().nullable().optional(),
    createdAt: z.date(),
    createdById: z.number().int().positive(),
    disputedAt: z.date().nullable().optional(),
    driver: z
      .object({
        fullName: z.string(),
        hubId: z.number().int().positive().nullable().optional(),
        id: z.number().int().positive(),
      })
      .passthrough()
      .optional(),
    driverId: z.number().int().positive(),
    id: z.number().int().positive(),
    items: z.array(CodSettlementItemResponseSchema).optional(),
    note: z.string().nullable().optional(),
    orderCount: z.number().int().nonnegative(),
    status: CodSettlementBatchStatusSchema,
    submittedAt: z.date().nullable().optional(),
    totalAmount: DecimalNumberSchema,
    updatedAt: z.date(),
  })
  .passthrough()

export const SettlementBatchListResponseSchema = z.object({
  data: z.array(CodSettlementBatchResponseSchema),
  limit: z.number().int().positive(),
  page: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
})
