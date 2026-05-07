import { z } from 'zod'
import {
  AddCodSchema,
  CompleteSettlementBatchSchema,
  CreateSettlementBatchSchema,
  DisputeSettlementBatchSchema,
  ListSettlementBatchesQuerySchema,
  OutstandingCodQuerySchema,
  ReconcileCodSchema,
} from '../model/wallet.model'

export type AddCodDto = z.infer<typeof AddCodSchema>
export type ReconcileCodDto = z.infer<typeof ReconcileCodSchema>
export type OutstandingCodQueryDto = z.infer<typeof OutstandingCodQuerySchema>
export type ListSettlementBatchesQueryDto = z.infer<typeof ListSettlementBatchesQuerySchema>
export type CreateSettlementBatchDto = z.infer<typeof CreateSettlementBatchSchema>
export type CompleteSettlementBatchDto = z.infer<typeof CompleteSettlementBatchSchema>
export type DisputeSettlementBatchDto = z.infer<typeof DisputeSettlementBatchSchema>
