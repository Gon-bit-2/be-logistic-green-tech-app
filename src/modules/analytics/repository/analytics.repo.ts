import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { GetAnalyticsQueryType } from '../model/analytics.model'

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private getDateRangeCondition(dateRange: string) {
    const now = new Date()
    const startDate = new Date()

    switch (dateRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    return { startDate, endDate: now }
  }

  private getTruncFormat(dateRange: string) {
    if (dateRange === '1y') return 'month'
    if (dateRange === '90d') return 'week'
    return 'day'
  }

  private getPeriodName(dateRange: string, date: Date) {
    if (dateRange === '1y') {
      return date.toLocaleString('en-US', { month: 'short' })
    }
    return date.toLocaleString('en-US', { weekday: 'short' })
  }

  private roundMetric(value: number | null | undefined, fractionDigits = 2) {
    const numericValue = Number(value ?? 0)
    if (!Number.isFinite(numericValue)) return 0
    return Number(numericValue.toFixed(fractionDigits))
  }

  async getDashboardSummary(query: GetAnalyticsQueryType) {
    const { startDate, endDate } = this.getDateRangeCondition(query.dateRange || '30d')

    const totalOrders = await this.prismaService.order.count({
      where: { createdAt: { gte: startDate, lte: endDate } },
    })

    const revenueResult = await this.prismaService.order.aggregate({
      _sum: { shippingFee: true },
      where: { createdAt: { gte: startDate, lte: endDate }, status: 'DELIVERED' },
    })
    const totalRevenue = Number(revenueResult._sum.shippingFee || 0)

    const distanceResult = await this.prismaService.trip.aggregate({
      _sum: { totalDistance: true },
      where: { createdAt: { gte: startDate, lte: endDate }, status: 'COMPLETED' },
    })
    const totalDistance = distanceResult._sum.totalDistance || 0

    const co2Result = await this.prismaService.tripEmissionLog.aggregate({
      _sum: { co2Saved: true },
      where: { createdAt: { gte: startDate, lte: endDate }, isLatest: true },
    })
    const totalCo2Saved = Number(co2Result._sum.co2Saved || 0)

    const [deliveryMetrics] = await this.prismaService.$queryRaw<
      {
        avgDeliveryTime: number
        onTimeDeliveryRate: number
      }[]
    >`
      WITH delivered_events AS (
        SELECT "orderId", MAX("occurredAt") AS "deliveredAt"
        FROM "order_tracking_events"
        WHERE "status" = 'DELIVERED'
        GROUP BY "orderId"
      ),
      delivered_orders AS (
        SELECT
          o.id,
          o."createdAt",
          o."preferredDeliveryTimeEnd",
          COALESCE(de."deliveredAt", o."updatedAt") AS "deliveredAt"
        FROM "orders" o
        LEFT JOIN delivered_events de ON de."orderId" = o.id
        WHERE o."createdAt" >= ${startDate}
          AND o."createdAt" <= ${endDate}
          AND o."status" = 'DELIVERED'
      )
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 3600), 0)::float AS "avgDeliveryTime",
        CASE
          WHEN COUNT(*) FILTER (WHERE "preferredDeliveryTimeEnd" IS NOT NULL) = 0 THEN 0
          ELSE (
            COUNT(*) FILTER (
              WHERE "preferredDeliveryTimeEnd" IS NOT NULL
                AND "deliveredAt" <= "preferredDeliveryTimeEnd"
            )::float
            / COUNT(*) FILTER (WHERE "preferredDeliveryTimeEnd" IS NOT NULL)::float
          ) * 100
        END::float AS "onTimeDeliveryRate"
      FROM delivered_orders
    `

    return {
      totalOrders,
      totalRevenue,
      totalDistance,
      totalCo2Saved,
      avgDeliveryTime: this.roundMetric(deliveryMetrics?.avgDeliveryTime),
      onTimeDeliveryRate: this.roundMetric(deliveryMetrics?.onTimeDeliveryRate),
    }
  }

  async getOrdersAnalytics(query: GetAnalyticsQueryType) {
    const { startDate, endDate } = this.getDateRangeCondition(query.dateRange || '30d')
    const truncFormat = this.getTruncFormat(query.dateRange || '30d')

    const rawData = await this.prismaService.$queryRaw<
      {
        truncDate: Date
        count: number
        revenue: number
        avgDeliveryTime: number
      }[]
    >`
      WITH delivered_events AS (
        SELECT "orderId", MAX("occurredAt") AS "deliveredAt"
        FROM "order_tracking_events"
        WHERE "status" = 'DELIVERED'
        GROUP BY "orderId"
      )
      SELECT 
        DATE_TRUNC(${truncFormat}, o."createdAt") as "truncDate",
        COUNT(o.id)::int as "count",
        COALESCE(SUM(o."shippingFee"), 0)::float as "revenue",
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (COALESCE(de."deliveredAt", o."updatedAt") - o."createdAt")) / 3600)
            FILTER (WHERE o."status" = 'DELIVERED'),
          0
        )::float as "avgDeliveryTime"
      FROM "orders" o
      LEFT JOIN delivered_events de ON de."orderId" = o.id
      WHERE o."createdAt" >= ${startDate} AND o."createdAt" <= ${endDate}
      GROUP BY "truncDate"
      ORDER BY "truncDate" ASC
    `

    return rawData.map((row) => ({
      period: this.getPeriodName(query.dateRange || '30d', new Date(row.truncDate)),
      count: row.count,
      revenue: row.revenue,
      avgDeliveryTime: this.roundMetric(row.avgDeliveryTime),
    }))
  }

  async getEmissionsAnalytics(query: GetAnalyticsQueryType) {
    const { startDate, endDate } = this.getDateRangeCondition(query.dateRange || '30d')
    const truncFormat = this.getTruncFormat(query.dateRange || '30d')

    const rawData = await this.prismaService.$queryRaw<
      {
        truncDate: Date
        co2Emitted: number
        co2Saved: number
        greenTripsCount: number
      }[]
    >`
      SELECT 
        DATE_TRUNC(${truncFormat}, "createdAt") as "truncDate",
        COALESCE(SUM("co2Emitted"), 0)::float as "co2Emitted",
        COALESCE(SUM("co2Saved"), 0)::float as "co2Saved",
        COUNT(id)::int as "greenTripsCount"
      FROM "trip_emission_logs"
      WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate} AND "isLatest" = true
      GROUP BY "truncDate"
      ORDER BY "truncDate" ASC
    `

    return rawData.map((row) => ({
      period: this.getPeriodName(query.dateRange || '30d', new Date(row.truncDate)),
      co2Emitted: row.co2Emitted,
      co2Saved: row.co2Saved,
      greenTripsCount: row.greenTripsCount,
    }))
  }

  async getFleetPerformance(query: GetAnalyticsQueryType) {
    const { startDate, endDate } = this.getDateRangeCondition(query.dateRange || '30d')

    const rawData = await this.prismaService.$queryRaw<
      {
        vehicleId: string
        licensePlate: string
        orderCount: number
        totalTrips: number
        totalDistance: number
        co2Saved: number
      }[]
    >`
      WITH completed_trips AS (
        SELECT id, "vehicleId", COALESCE("totalDistance", 0) AS "totalDistance"
        FROM "trips"
        WHERE "createdAt" >= ${startDate}
          AND "createdAt" <= ${endDate}
          AND "status" = 'COMPLETED'
      ),
      trip_order_counts AS (
        SELECT "tripId", COUNT(DISTINCT "orderId") FILTER (WHERE "orderId" IS NOT NULL)::int AS "orderCount"
        FROM "trip_stops"
        GROUP BY "tripId"
      ),
      vehicle_trip_metrics AS (
        SELECT
          ct."vehicleId",
          COUNT(ct.id)::int AS "totalTrips",
          COALESCE(SUM(toc."orderCount"), 0)::int AS "orderCount",
          COALESCE(SUM(ct."totalDistance"), 0)::float AS "totalDistance"
        FROM completed_trips ct
        LEFT JOIN trip_order_counts toc ON toc."tripId" = ct.id
        GROUP BY ct."vehicleId"
      ),
      vehicle_emission_metrics AS (
        SELECT
          ct."vehicleId",
          COALESCE(SUM(el."co2Saved"), 0)::float AS "co2Saved"
        FROM completed_trips ct
        LEFT JOIN "trip_emission_logs" el ON el."tripId" = ct.id AND el."isLatest" = true
        GROUP BY ct."vehicleId"
      )
      SELECT 
        v.id as "vehicleId",
        v."licensePlate",
        COALESCE(vtm."totalTrips", 0)::int as "totalTrips",
        COALESCE(vtm."orderCount", 0)::int as "orderCount",
        COALESCE(vtm."totalDistance", 0)::float as "totalDistance",
        COALESCE(vem."co2Saved", 0)::float as "co2Saved"
      FROM "vehicles" v
      LEFT JOIN vehicle_trip_metrics vtm ON vtm."vehicleId" = v.id
      LEFT JOIN vehicle_emission_metrics vem ON vem."vehicleId" = v.id
      ORDER BY "totalDistance" DESC
      LIMIT 10
    `

    return rawData.map((row) => ({
      vehicleId: `v${row.vehicleId}`,
      licensePlate: row.licensePlate,
      orderCount: row.orderCount,
      totalTrips: row.totalTrips,
      totalDistance: row.totalDistance,
      efficiency: this.roundMetric(row.totalDistance > 0 ? row.orderCount / row.totalDistance : 0),
      co2Saved: row.co2Saved,
    }))
  }
}
