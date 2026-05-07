import { z } from 'zod'

export const CalculationMethodSchema = z.enum(['HAVERSINE', 'GPS_ACTUAL', 'MANUAL', 'TRIP_TOTAL_DISTANCE'])
export const AllocationMethodSchema = z.enum(['WEIGHT_RATIO', 'DISTANCE_RATIO', 'EQUAL_SPLIT'])

export const CalculateEmissionParamsSchema = z.object({
  tripId: z.coerce.number().int().positive('Trip ID không hợp lệ'),
})

export const EmissionLogResponseSchema = z.object({
  id: z.number(),
  tripId: z.number(),
  version: z.number(),
  isLatest: z.boolean(),
  actualDistance: z.number(),
  payloadWeight: z.number(),
  co2Emitted: z.number(),
  co2Saved: z.number(),
  emissionFactor: z.number(),
  baselineRate: z.number(),
  vehicleType: z.string(),
  fuelType: z.string(),
  calculationMethod: z.string(),
  ghgScope: z.number(),
  calculatedAt: z.date(),
})

export const OrderAllocationResponseSchema = z.object({
  orderId: z.number(),
  allocatedCo2: z.number(),
  allocatedCo2Saved: z.number(),
  weightRatio: z.number().nullable(),
})

export const GreenTechDashboardQuerySchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  dateRange: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
  hubId: z.coerce.number().int().positive().optional(),
})

export const GreenTechExportQuerySchema = GreenTechDashboardQuerySchema.extend({
  scope: z.enum(['orders', 'trips', 'customers']).default('trips'),
})

export type CalculateEmissionParamsType = z.infer<typeof CalculateEmissionParamsSchema>
export type EmissionLogResponseType = z.infer<typeof EmissionLogResponseSchema>
export type GreenTechDashboardQueryType = z.infer<typeof GreenTechDashboardQuerySchema>
export type GreenTechExportQueryType = z.infer<typeof GreenTechExportQuerySchema>
export type OrderAllocationResponseType = z.infer<typeof OrderAllocationResponseSchema>

export interface EmissionLogInput {
  tripId: number
  version: number
  isLatest: boolean
  actualDistance: number
  payloadWeight: number
  co2Emitted: number
  co2Saved: number
  emissionFactor: number
  baselineRate: number
  vehicleType: string
  fuelType: string
  calculationMethod: string
  ghgScope: number
}

export interface EmissionAllocationInput {
  orderId: number
  allocatedCo2: number
  allocatedCo2Saved: number
  allocationMethod: string
  weightRatio: number
}
