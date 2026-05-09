import {
  AuditLogQuerySchema,
  ObservabilityLimitQuerySchema,
  ObservabilityPaginationQuerySchema,
} from './observability.dto'

describe('observability query DTOs', () => {
  it('applies pagination defaults', () => {
    expect(ObservabilityPaginationQuerySchema.parse({})).toEqual({
      limit: 25,
      page: 1,
    })
  })

  it('rejects invalid limit and page values', () => {
    expect(() => ObservabilityLimitQuerySchema.parse({ limit: 'abc' })).toThrow()
    expect(() => ObservabilityPaginationQuerySchema.parse({ page: '0' })).toThrow()
  })

  it('rejects over-limit queries instead of silently clamping at controller boundary', () => {
    expect(() => ObservabilityPaginationQuerySchema.parse({ limit: '101' })).toThrow()
  })

  it('keeps audit log filters explicit', () => {
    expect(AuditLogQuerySchema.parse({ entityType: 'ORDER', limit: '10', page: '2' })).toEqual({
      entityType: 'ORDER',
      limit: 10,
      page: 2,
    })
  })
})
