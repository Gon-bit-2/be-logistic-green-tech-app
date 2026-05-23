import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { GetAnalyticsQueryType } from '../model/analytics.model'

/**
 * Repository for handling complex analytics data aggregation, sustainability (CO2) statistics, and operational KPIs via SQL raw queries.
 * 
 * Kho lưu trữ xử lý việc tổng hợp dữ liệu phân tích phức tạp, thống kê bền vững (CO2) và các chỉ số KPI vận hành thông qua các truy vấn SQL thô.
 */
@Injectable()
export class AnalyticsRepository {
  /**
   * Initializes the AnalyticsRepository.
   * 
   * Khởi tạo AnalyticsRepository.
   * 
   * @param prismaService - Prisma Database Service / Dịch vụ cơ sở dữ liệu Prisma.
   */
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Helper that resolves the appropriate start date according to selected timeframe (e.g. '7d', '30d').
   * 
   * Trình hỗ trợ phân tích ngày bắt đầu phù hợp theo khung thời gian đã chọn (ví dụ: '7d', '30d').
   * 
   * @param dateRange - Timeframe code string / Chuỗi mã khung thời gian.
   * @returns Object containing resolved start date and end date (now) / Đối tượng chứa ngày bắt đầu đã phân tích và ngày kết thúc (hiện tại).
   */
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

  /**
   * Helper resolving appropriate trunc granularity string for PostgreSQL DATE_TRUNC.
   * 
   * Trình hỗ trợ lấy độ phân giải làm tròn ngày phù hợp cho PostgreSQL DATE_TRUNC.
   * 
   * @param dateRange - Timeframe code string / Chuỗi mã khung thời gian.
   * @returns Granularity keyword (e.g. 'month', 'week', 'day') / Từ khóa độ phân giải (ví dụ: 'month', 'week', 'day').
   */
  private getTruncFormat(dateRange: string) {
    if (dateRange === '1y') return 'month'
    if (dateRange === '90d') return 'week'
    return 'day'
  }

  /**
   * Helper that formats a Date string to appropriate localized weekday/month labels.
   * 
   * Trình hỗ trợ định dạng chuỗi Ngày thành các nhãn ngày trong tuần/tháng được định vị phù hợp.
   * 
   * @param dateRange - Timeframe code string / Chuỗi mã khung thời gian.
   * @param date - Date object / Đối tượng Date.
   * @returns Short localized date/month label / Nhãn tên ngày/tháng viết tắt được định vị.
   */
  private getPeriodName(dateRange: string, date: Date) {
    if (dateRange === '1y') {
      return date.toLocaleString('en-US', { month: 'short' })
    }
    return date.toLocaleString('en-US', { weekday: 'short' })
  }

  /**
   * Helper to round float metrics to specific fraction digits.
   * 
   * Trình hỗ trợ làm tròn các chỉ số dấu phẩy động đến chữ số thập phân cụ thể.
   * 
   * @param value - Float number / Số dấu phẩy động.
   * @param fractionDigits - Decimals counts / Số lượng chữ số thập phân.
   * @returns Rounded float number / Số dấu phẩy động đã làm tròn.
   */
  private roundMetric(value: number | null | undefined, fractionDigits = 2) {
    const numericValue = Number(value ?? 0)
    if (!Number.isFinite(numericValue)) return 0
    return Number(numericValue.toFixed(fractionDigits))
  }

  /**
   * Retrieves overall dashboard summary analytics, including CO2 savings and delivery time metrics.
   * Uses raw SQL queries for complex aggregate performance.
   * 
   * Lấy dữ liệu phân tích tóm tắt toàn bộ dashboard, bao gồm lượng CO2 tiết kiệm và chỉ số thời gian giao hàng.
   * Sử dụng truy vấn SQL thô cho các hoạt động tổng hợp phức tạp để tối ưu hiệu suất.
   * 
   * @param query - Timeframe settings / Thiết lập khung thời gian.
   * @returns Object containing absolute operational statistics / Đối tượng chứa các thống kê vận hành tuyệt đối.
   */
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

  /**
   * Aggregates daily/weekly/monthly orders count, revenue, and delivery performance over a date range.
   * 
   * Tổng hợp số lượng đơn hàng, doanh thu và hiệu suất giao hàng theo ngày/tuần/tháng trong một khoảng thời gian.
   * 
   * @param query - Timeframe settings / Thiết lập cấu hình thời gian.
   * @returns Array of order metrics over time periods / Mảng các chỉ số đơn hàng theo từng chu kỳ.
   */
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

  /**
   * Aggregates CO2 emission outputs and savings details over time periods.
   * 
   * Tổng hợp chi tiết lượng khí thải CO2 thực tế và lượng CO2 tiết kiệm được theo từng chu kỳ thời gian.
   * 
   * @param query - Timeframe settings / Thiết lập cấu hình thời gian.
   * @returns Array of sustainability emission metrics over time periods / Mảng các chỉ số phát thải bền vững theo từng chu kỳ.
   */
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

  /**
   * Analyzes top performing active fleet vehicles, including their operational efficiency and CO2 saved.
   * 
   * Phân tích hoạt động của các phương tiện hàng đầu trong đội xe, gồm hiệu suất vận hành và lượng CO2 tiết kiệm được.
   * 
   * @param query - Timeframe settings / Thiết lập cấu hình thời gian.
   * @returns Array of fleet vehicle operational efficiency statistics / Mảng thống kê hiệu suất vận hành của các xe.
   */
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

  /**
   * Retrieves Service Level Agreement (SLA) metrics from pre-calculated alarm logs.
   * Avoids querying entire history logs to ensure high database response speed.
   * 
   * Lấy các chỉ số SLA từ nhật ký cảnh báo đã được tính toán sẵn.
   * Tránh việc quét toàn bộ nhật ký lịch sử nhằm đảm bảo tốc độ phản hồi tối đa của cơ sở dữ liệu.
   * 
   * @param query - Timeframe settings / Thiết lập cấu hình thời gian.
   * @returns General SLA alert and delays stats / Các số liệu thống kê cảnh báo SLA và chậm trễ chung.
   */
  async getSlaAnalytics(query: GetAnalyticsQueryType) {
    const { startDate, endDate } = this.getDateRangeCondition(query.dateRange || '30d')

    const [metrics] = await this.prismaService.$queryRaw<
      {
        activeAlerts: number
        avgDelayMinutes: number
        breachedOrders: number
        resolvedAlerts: number
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'ACTIVE')::int AS "activeAlerts",
        COUNT(DISTINCT "orderId")::int AS "breachedOrders",
        COUNT(*) FILTER (WHERE "status" = 'RESOLVED')::int AS "resolvedAlerts",
        COALESCE(
          AVG(EXTRACT(EPOCH FROM ("etaAt" - "deadlineAt")) / 60)
            FILTER (WHERE "etaAt" IS NOT NULL AND "deadlineAt" IS NOT NULL AND "etaAt" > "deadlineAt"),
          0
        )::float AS "avgDelayMinutes"
      FROM "sla_alerts"
      WHERE "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
    `

    // SLA dashboard đọc từ bảng alert đã chuẩn hóa để không phải scan toàn bộ timeline tracking.
    return {
      activeAlerts: metrics?.activeAlerts ?? 0,
      avgDelayMinutes: this.roundMetric(metrics?.avgDelayMinutes),
      breachedOrders: metrics?.breachedOrders ?? 0,
      resolvedAlerts: metrics?.resolvedAlerts ?? 0,
    }
  }
}
