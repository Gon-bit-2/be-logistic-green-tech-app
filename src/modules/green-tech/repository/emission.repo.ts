import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { Prisma } from 'generated/prisma'
import { EmissionLogInput, EmissionAllocationInput, GreenTechDashboardQueryType } from '../model/emission.model'

/**
 * Repository for managing database queries related to trip carbon emissions logs, sustainability dashboards, and report rows via Prisma.
 *
 * Kho lưu trữ quản lý các truy vấn cơ sở dữ liệu liên quan đến bản ghi phát thải carbon chuyến đi, dashboard bền vững và các hàng báo cáo qua Prisma.
 */
@Injectable()
export class EmissionRepository {
  /**
   * Initializes the EmissionRepository.
   *
   * Khởi tạo EmissionRepository.
   *
   * @param prismaService - Prisma service instance / Instance của dịch vụ Prisma.
   */
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Retrieves comprehensive original data of a trip, including vehicle properties and nested orders.
   * Helps calculate payloads, distance and emission rates for GLEC framework.
   *
   * Truy xuất toàn bộ thông tin gốc của một chuyến đi, bao gồm thuộc tính xe và các đơn hàng được gán.
   * Hỗ trợ tính toán tải trọng, quãng đường và tỷ lệ phát thải phục vụ cho GLEC framework.
   *
   * @param tripId - Trip ID / ID chuyến đi.
   * @returns Detailed trip entities with vehicle and orders / Chi tiết thực thể chuyến đi kèm xe và các đơn hàng.
   */
  async getTripSourceData(tripId: number) {
    return this.prismaService.trip.findUnique({
      where: { id: tripId },
      include: {
        vehicle: true, // Lấy emissionRatePerKm
        ordersOnBoard: {
          select: { id: true, totalWeight: true }, // Để tính weightRatio cho từng đơn
        },
      },
    })
  }

  /**
   * Saves trip emission logs and distributes carbon footprint allocations to orders in a single transaction block.
   * Soft deactivates isLatest flag on old log entries.
   *
   * Lưu các bản ghi phát thải carbon của chuyến đi và phân bổ lượng khí thải carbon cho các đơn hàng trong một khối transaction duy nhất.
   * Đặt cờ isLatest thành false trên các bản ghi log phiên bản cũ.
   *
   * @param tripId - Trip ID / ID chuyến đi.
   * @param logData - New emission log details / Chi tiết bản ghi phát thải mới.
   * @param allocationsData - Emission allocation details list / Danh sách chi tiết phân bổ phát thải.
   * @returns Newly created emission log entity / Thực thể bản ghi phát thải mới được tạo.
   */
  async saveEmissionData(tripId: number, logData: EmissionLogInput, allocationsData: EmissionAllocationInput[]) {
    return this.prismaService.$transaction(async (tx) => {
      // Đánh dấu các version cũ là obsolete
      await tx.tripEmissionLog.updateMany({
        where: { tripId, isLatest: true },
        data: { isLatest: false },
      })

      // Lưu log mới
      const emissionLog = await tx.tripEmissionLog.create({
        data: logData,
      })

      // Gắn Allocations
      if (allocationsData.length > 0) {
        const allocs = allocationsData.map((a) => ({
          ...a,
          emissionLogId: emissionLog.id,
        }))
        await tx.orderEmissionAllocation.createMany({
          data: allocs,
        })
      }

      return emissionLog
    })
  }

  /**
   * Retrieves all historical emission logs for a specific trip, ordered by version descending.
   *
   * Lấy tất cả lịch sử các bản ghi phát thải của một chuyến đi cụ thể, sắp xếp giảm dần theo phiên bản.
   *
   * @param tripId - Trip ID / ID chuyến đi.
   * @returns Array of emission logs / Mảng các bản ghi phát thải.
   */
  async getTripLogs(tripId: number) {
    return this.prismaService.tripEmissionLog.findMany({
      where: { tripId },
      include: {
        allocations: true,
      },
      orderBy: { version: 'desc' },
    })
  }

  /**
   * Helper that resolves timeframe dates based on range codes (e.g. '7d', '30d').
   *
   * Trình hỗ trợ lấy ngày khoảng thời gian tương ứng dựa trên mã phạm vi (ví dụ: '7d', '30d').
   *
   * @param dateRange - Timeframe string / Chuỗi khung thời gian.
   * @returns Object containing start date and end date / Đối tượng chứa ngày bắt đầu và ngày kết thúc.
   */
  getDateRange(dateRange: GreenTechDashboardQueryType['dateRange']) {
    const endDate = new Date()
    const startDate = new Date(endDate)

    if (dateRange === '7d') startDate.setDate(endDate.getDate() - 7)
    else if (dateRange === '90d') startDate.setDate(endDate.getDate() - 90)
    else if (dateRange === '1y') startDate.setFullYear(endDate.getFullYear() - 1)
    else startDate.setDate(endDate.getDate() - 30)

    return { startDate, endDate }
  }

  /**
   * Computes cumulative totals for green technology dashboard metrics.
   *
   * Tính toán tổng tích lũy cho các số liệu của trang dashboard công nghệ xanh.
   *
   * @param query - Query filters / Các bộ lọc truy vấn.
   * @returns Cumulative dashboard sustainability metrics / Các số liệu phát triển bền vững tích lũy của trang dashboard.
   */
  async getGreenDashboard(query: GreenTechDashboardQueryType) {
    const { startDate, endDate } = this.getDateRange(query.dateRange)

    const emissionWhere = this.buildEmissionWhere(query, startDate, endDate)
    const allocationWhere = this.buildAllocationWhere(query, startDate, endDate)

    const [emissionTotals, greenTripCount, allocationTotals, topVehicles] = await Promise.all([
      this.prismaService.tripEmissionLog.aggregate({
        _sum: { co2Emitted: true, co2Saved: true },
        where: emissionWhere,
      }),
      this.prismaService.tripEmissionLog.count({ where: emissionWhere }),
      this.prismaService.orderEmissionAllocation.aggregate({
        _avg: { allocatedCo2Saved: true },
        _count: { id: true },
        _sum: { allocatedCo2: true, allocatedCo2Saved: true },
        where: allocationWhere,
      }),
      this.getTopVehicles(query, startDate, endDate),
    ])

    return {
      averageCo2SavedPerOrder: Number(allocationTotals._avg.allocatedCo2Saved ?? 0),
      greenOrderCount: allocationTotals._count.id,
      greenTripCount,
      topVehicles,
      totalAllocatedCo2: Number(allocationTotals._sum.allocatedCo2 ?? 0),
      totalAllocatedCo2Saved: Number(allocationTotals._sum.allocatedCo2Saved ?? 0),
      totalCo2Emitted: Number(emissionTotals._sum.co2Emitted ?? 0),
      totalCo2Saved: Number(emissionTotals._sum.co2Saved ?? 0),
    }
  }

  /**
   * Finds carbon footprint allocations linked to an active order.
   *
   * Tìm phân bổ dấu chân carbon liên kết với một đơn hàng đang hoạt động.
   *
   * @param orderId - Order ID / ID đơn hàng.
   * @returns Order carbon footprint allocations list / Danh sách phân bổ dấu chân carbon của đơn hàng.
   */
  async getOrderFootprint(orderId: number) {
    return this.prismaService.order.findFirst({
      where: { deletedAt: null, id: orderId },
      select: {
        customerId: true,
        id: true,
        trackingCode: true,
        emissionAllocations: {
          where: {
            emissionLog: {
              deletedAt: null,
              isLatest: true,
            },
          },
          include: {
            emissionLog: {
              select: {
                actualDistance: true,
                calculatedAt: true,
                co2Emitted: true,
                co2Saved: true,
                emissionFactor: true,
                fuelType: true,
                id: true,
                tripId: true,
                vehicleType: true,
                version: true,
              },
            },
          },
          orderBy: { id: 'desc' },
        },
      },
    })
  }

  /**
   * Computes carbon savings and green orders totals specifically for a customer.
   *
   * Tính toán tổng lượng carbon tiết kiệm và đơn hàng xanh dành riêng cho một khách hàng.
   *
   * @param customerId - Customer User ID / ID người dùng khách hàng.
   * @param query - Date range configurations / Cấu hình khoảng thời gian.
   * @returns Sustainability statistics details / Chi tiết thông số thống kê bền vững.
   */
  async getCustomerGreenSummary(customerId: number, query: Pick<GreenTechDashboardQueryType, 'dateRange'>) {
    const { startDate, endDate } = this.getDateRange(query.dateRange)

    const totals = await this.prismaService.orderEmissionAllocation.aggregate({
      _count: { id: true },
      _sum: { allocatedCo2: true, allocatedCo2Saved: true },
      where: {
        emissionLog: {
          calculatedAt: { gte: startDate, lte: endDate },
          deletedAt: null,
          isLatest: true,
        },
        order: {
          customerId,
          deletedAt: null,
        },
      },
    })

    return {
      greenOrderCount: totals._count.id,
      totalCo2: Number(totals._sum.allocatedCo2 ?? 0),
      totalCo2Saved: Number(totals._sum.allocatedCo2Saved ?? 0),
    }
  }

  /**
   * Finds all trip emission records within range filters for reporting.
   *
   * Tìm tất cả các bản ghi phát thải chuyến đi trong phạm vi bộ lọc để làm báo cáo.
   *
   * @param query - Query filters / Các bộ lọc truy vấn.
   * @returns Array of trip emission logs / Mảng các bản ghi phát thải chuyến đi.
   */
  async getTripReportRows(query: GreenTechDashboardQueryType) {
    const { startDate, endDate } = this.getDateRange(query.dateRange)
    return this.prismaService.tripEmissionLog.findMany({
      where: this.buildEmissionWhere(query, startDate, endDate),
      orderBy: { calculatedAt: 'desc' },
      select: {
        actualDistance: true,
        calculatedAt: true,
        co2Emitted: true,
        co2Saved: true,
        fuelType: true,
        id: true,
        tripId: true,
        vehicleType: true,
      },
    })
  }

  /**
   * Finds order allocation records within range filters for reporting.
   *
   * Tìm tất cả bản ghi phân bổ đơn hàng trong phạm vi bộ lọc phục vụ làm báo cáo.
   *
   * @param query - Query filters / Các bộ lọc truy vấn.
   * @returns Array of order allocation details / Mảng chi tiết phân bổ đơn hàng.
   */
  async getOrderReportRows(query: GreenTechDashboardQueryType) {
    const { startDate, endDate } = this.getDateRange(query.dateRange)
    return this.prismaService.orderEmissionAllocation.findMany({
      where: this.buildAllocationWhere(query, startDate, endDate),
      orderBy: { emissionLog: { calculatedAt: 'desc' } },
      select: {
        allocatedCo2: true,
        allocatedCo2Saved: true,
        order: { select: { customerId: true, id: true, trackingCode: true } },
        emissionLog: { select: { calculatedAt: true, tripId: true } },
      },
    })
  }

  /**
   * Aggregates emission saving rows grouped by customer ID for reporting.
   *
   * Tổng hợp các hàng dữ liệu carbon tiết kiệm được nhóm theo ID khách hàng phục vụ làm báo cáo.
   *
   * @param query - Query filters / Các bộ lọc truy vấn.
   * @returns Array of aggregated customer reporting statistics / Mảng thống kê báo cáo khách hàng tổng hợp.
   */
  async getCustomerReportRows(query: GreenTechDashboardQueryType) {
    const { startDate, endDate } = this.getDateRange(query.dateRange)
    const rows = await this.prismaService.orderEmissionAllocation.groupBy({
      by: ['orderId'],
      _sum: { allocatedCo2: true, allocatedCo2Saved: true },
      where: this.buildAllocationWhere(query, startDate, endDate),
    })

    const orders = await this.prismaService.order.findMany({
      where: { id: { in: rows.map((row) => row.orderId) } },
      select: { customer: { select: { fullName: true, id: true } }, id: true },
    })
    const orderById = new Map(orders.map((order) => [order.id, order]))

    const customerTotals = new Map<
      number,
      { customerName: string; orderCount: number; totalCo2: number; totalCo2Saved: number }
    >()
    for (const row of rows) {
      const order = orderById.get(row.orderId)
      if (!order) continue
      const current = customerTotals.get(order.customer.id) ?? {
        customerName: order.customer.fullName,
        orderCount: 0,
        totalCo2: 0,
        totalCo2Saved: 0,
      }
      current.orderCount += 1
      current.totalCo2 += Number(row._sum.allocatedCo2 ?? 0)
      current.totalCo2Saved += Number(row._sum.allocatedCo2Saved ?? 0)
      customerTotals.set(order.customer.id, current)
    }

    return [...customerTotals.entries()].map(([customerId, value]) => ({ customerId, ...value }))
  }

  /**
   * Builds the conditional SQL Prisma where clause for trip emissions.
   *
   * Xây dựng mệnh đề điều kiện SQL Prisma where cho lượng khí phát thải của chuyến đi.
   *
   * @param query - Query filters / Các bộ lọc truy vấn.
   * @param startDate - Start date boundary / Mốc thời gian bắt đầu.
   * @param endDate - End date boundary / Mốc thời gian kết thúc.
   * @returns Prisma WHERE configuration / Cấu hình WHERE của Prisma.
   */
  private buildEmissionWhere(query: GreenTechDashboardQueryType, startDate: Date, endDate: Date) {
    return {
      calculatedAt: { gte: startDate, lte: endDate },
      deletedAt: null,
      isLatest: true,
      ...(query.hubId ? { trip: { vehicle: { hubId: query.hubId } } } : {}),
      ...(query.customerId
        ? {
            allocations: {
              some: {
                order: {
                  customerId: query.customerId,
                  deletedAt: null,
                },
              },
            },
          }
        : {}),
    } satisfies Prisma.TripEmissionLogWhereInput
  }

  /**
   * Builds the conditional SQL Prisma where clause for order allocations.
   *
   * Xây dựng mệnh đề điều kiện SQL Prisma where cho phân bổ đơn hàng.
   *
   * @param query - Query filters / Các bộ lọc truy vấn.
   * @param startDate - Start date boundary / Mốc thời gian bắt đầu.
   * @param endDate - End date boundary / Mốc thời gian kết thúc.
   * @returns Prisma WHERE configuration / Cấu hình WHERE của Prisma.
   */
  private buildAllocationWhere(query: GreenTechDashboardQueryType, startDate: Date, endDate: Date) {
    return {
      emissionLog: {
        calculatedAt: { gte: startDate, lte: endDate },
        deletedAt: null,
        isLatest: true,
        ...(query.hubId ? { trip: { vehicle: { hubId: query.hubId } } } : {}),
      },
      order: {
        deletedAt: null,
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
    } satisfies Prisma.OrderEmissionAllocationWhereInput
  }

  /**
   * Gathers information on the top 10 sustainability efficient vehicles (maximum CO2 saved) inside memory.
   *
   * Thu thập thông tin của 10 phương tiện hiệu suất bền vững hàng đầu (tiết kiệm nhiều CO2 nhất) trong bộ nhớ.
   *
   * @param query - Query filters / Các bộ lọc truy vấn.
   * @param startDate - Start date / Ngày bắt đầu.
   * @param endDate - End date / Ngày kết thúc.
   * @returns Top 10 vehicles sorted by CO2 savings / Danh sách 10 xe hàng đầu sắp xếp theo lượng CO2 tiết kiệm.
   */
  private async getTopVehicles(query: GreenTechDashboardQueryType, startDate: Date, endDate: Date) {
    const logs = await this.prismaService.tripEmissionLog.findMany({
      where: this.buildEmissionWhere(query, startDate, endDate),
      select: {
        co2Saved: true,
        trip: {
          select: {
            vehicle: {
              select: {
                id: true,
                licensePlate: true,
                type: true,
              },
            },
          },
        },
      },
    })

    // Top vehicle được aggregate trong memory để hỗ trợ cả filter customerId,
    // vì Prisma groupBy không group trực tiếp qua nested relation + allocation filter.
    const totals = new Map<number, { co2Saved: number; licensePlate: string; vehicleId: number; vehicleType: string }>()
    for (const log of logs) {
      const vehicle = log.trip.vehicle
      const current = totals.get(vehicle.id) ?? {
        co2Saved: 0,
        licensePlate: vehicle.licensePlate,
        vehicleId: vehicle.id,
        vehicleType: vehicle.type,
      }
      current.co2Saved += Number(log.co2Saved)
      totals.set(vehicle.id, current)
    }

    return [...totals.values()].sort((a, b) => b.co2Saved - a.co2Saved).slice(0, 10)
  }
}
