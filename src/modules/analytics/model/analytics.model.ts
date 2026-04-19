import z from 'zod'

export const GetAnalyticsQuerySchema = z.object({
  dateRange: z.enum(['7d', '30d', '90d', '1y']).optional().default('30d'),
})

export const DashboardSummaryResSchema = z.object({
  totalOrders: z.number(),
  totalRevenue: z.number(),
  totalDistance: z.number(),
  totalCo2Saved: z.number(),
  avgDeliveryTime: z.number(),
  onTimeDeliveryRate: z.number(),
})

export const OrderAnalyticsResSchema = z.array(
  z.object({
    period: z.string(),
    count: z.number(),
    revenue: z.number(),
    avgDeliveryTime: z.number(),
  }),
)

export const EmissionsAnalyticsResSchema = z.array(
  z.object({
    period: z.string(),
    co2Emitted: z.number(),
    co2Saved: z.number(),
    greenTripsCount: z.number(),
  }),
)

export const FleetPerformanceResSchema = z.array(
  z.object({
    vehicleId: z.string(),
    licensePlate: z.string(),
    totalTrips: z.number(),
    totalDistance: z.number(),
    efficiency: z.number(),
    co2Saved: z.number(),
  }),
)

export type GetAnalyticsQueryType = z.infer<typeof GetAnalyticsQuerySchema>
export type DashboardSummaryResType = z.infer<typeof DashboardSummaryResSchema>
export type OrderAnalyticsResType = z.infer<typeof OrderAnalyticsResSchema>
export type EmissionsAnalyticsResType = z.infer<typeof EmissionsAnalyticsResSchema>
export type FleetPerformanceResType = z.infer<typeof FleetPerformanceResSchema>
