import { z } from 'zod'
import { DecimalNumberSchema } from 'src/common/utils/decimal.util'

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
  actualDistance: DecimalNumberSchema,
  payloadWeight: DecimalNumberSchema,
  co2Emitted: DecimalNumberSchema,
  co2Saved: DecimalNumberSchema,
  emissionFactor: DecimalNumberSchema,
  baselineRate: DecimalNumberSchema,
  vehicleType: z.string(),
  fuelType: z.string(),
  calculationMethod: z.string(),
  ghgScope: z.number(),
  calculatedAt: z.date(),
})

export const OrderAllocationResponseSchema = z.object({
  orderId: z.number(),
  allocatedCo2: DecimalNumberSchema,
  allocatedCo2Saved: DecimalNumberSchema,
  weightRatio: DecimalNumberSchema.nullable(),
})

export const EmissionAllocationResponseSchema = OrderAllocationResponseSchema.extend({
  allocationMethod: z.string(),
  calculatedAt: z.date().optional(),
  createdAt: z.date().optional(),
  emissionLogId: z.number().int().positive().optional(),
  id: z.number().int().positive().optional(),
  tripId: z.number().int().positive().optional(),
  updatedAt: z.date().optional(),
}).passthrough()

export const EmissionLogWithAllocationsResponseSchema = EmissionLogResponseSchema.extend({
  allocations: z.array(EmissionAllocationResponseSchema).optional(),
}).passthrough()

export const EmissionLogListResponseSchema = z.array(EmissionLogWithAllocationsResponseSchema)

export const GreenTechDashboardResSchema = z.object({
  averageCo2SavedPerOrder: z.number(),
  greenOrderCount: z.number().int().nonnegative(),
  greenTripCount: z.number().int().nonnegative(),
  topVehicles: z.array(
    z.object({
      co2Saved: z.number(),
      licensePlate: z.string(),
      vehicleId: z.number().int().positive(),
      vehicleType: z.string(),
    }),
  ),
  totalAllocatedCo2: z.number(),
  totalAllocatedCo2Saved: z.number(),
  totalCo2Emitted: z.number(),
  totalCo2Saved: z.number(),
})

export const OrderFootprintResSchema = z.object({
  allocations: z.array(
    z.object({
      allocatedCo2: z.number(),
      allocatedCo2Saved: z.number(),
      allocationMethod: z.string(),
      calculatedAt: z.date(),
      emissionLogId: z.number().int().positive(),
      tripId: z.number().int().positive(),
      weightRatio: z.number().nullable(),
    }),
  ),
  orderId: z.number().int().positive(),
  trackingCode: z.string(),
  totalAllocatedCo2: z.number(),
  totalAllocatedCo2Saved: z.number(),
})

export const CustomerGreenSummaryResSchema = z.object({
  greenOrderCount: z.number().int().nonnegative(),
  totalCo2: z.number(),
  totalCo2Saved: z.number(),
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
export type EmissionLogListResponseType = z.infer<typeof EmissionLogListResponseSchema>
export type GreenTechDashboardQueryType = z.infer<typeof GreenTechDashboardQuerySchema>
export type GreenTechDashboardResType = z.infer<typeof GreenTechDashboardResSchema>
export type GreenTechExportQueryType = z.infer<typeof GreenTechExportQuerySchema>
export type OrderFootprintResType = z.infer<typeof OrderFootprintResSchema>
export type OrderAllocationResponseType = z.infer<typeof OrderAllocationResponseSchema>
export type CustomerGreenSummaryResType = z.infer<typeof CustomerGreenSummaryResSchema>

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
