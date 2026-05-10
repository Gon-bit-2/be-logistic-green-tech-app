import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  AddCodSchema,
  CodSettlementBatchResponseSchema,
  CompleteSettlementBatchSchema,
  CreateSettlementBatchSchema,
  DisputeSettlementBatchSchema,
  ListSettlementBatchesQuerySchema,
  OutstandingCodOrderListSchema,
  OutstandingCodQuerySchema,
  ReconcileCodSchema,
  SettlementBatchListResponseSchema,
  WalletResponseSchema,
} from '../model/wallet.model'

export type AddCodDto = z.infer<typeof AddCodSchema>
export type ReconcileCodDto = z.infer<typeof ReconcileCodSchema>
export type OutstandingCodQueryDto = z.infer<typeof OutstandingCodQuerySchema>
export type ListSettlementBatchesQueryDto = z.infer<typeof ListSettlementBatchesQuerySchema>
export type CreateSettlementBatchDto = z.infer<typeof CreateSettlementBatchSchema>
export type CompleteSettlementBatchDto = z.infer<typeof CompleteSettlementBatchSchema>
export type DisputeSettlementBatchDto = z.infer<typeof DisputeSettlementBatchSchema>

export class WalletResponseDto extends createZodDto(WalletResponseSchema, { codec: true }) {}
export class OutstandingCodOrderListDto extends createZodDto(OutstandingCodOrderListSchema, { codec: true }) {}
export class CodSettlementBatchResponseDto extends createZodDto(CodSettlementBatchResponseSchema, { codec: true }) {}
export class SettlementBatchListResponseDto extends createZodDto(SettlementBatchListResponseSchema, { codec: true }) {}
