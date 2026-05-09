import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const ObservabilityLimitQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(25),
  })
  .strict()

export const ObservabilityPaginationQuerySchema = ObservabilityLimitQuerySchema.extend({
  page: z.coerce.number().int().positive().default(1),
}).strict()

export const AuditLogQuerySchema = ObservabilityPaginationQuerySchema.extend({
  entityType: z.string().trim().min(1).optional(),
}).strict()

export class ObservabilityLimitQueryDto extends createZodDto(ObservabilityLimitQuerySchema) {}
export class ObservabilityPaginationQueryDto extends createZodDto(ObservabilityPaginationQuerySchema) {}
export class AuditLogQueryDto extends createZodDto(AuditLogQuerySchema) {}

export type ObservabilityLimitQueryType = z.infer<typeof ObservabilityLimitQuerySchema>
export type ObservabilityPaginationQueryType = z.infer<typeof ObservabilityPaginationQuerySchema>
export type AuditLogQueryType = z.infer<typeof AuditLogQuerySchema>
