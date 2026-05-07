import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { Prisma } from 'generated/prisma'
import { EmissionLogInput, EmissionAllocationInput, GreenTechDashboardQueryType } from '../model/emission.model'

@Injectable()
export class EmissionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Truy xuất toàn bộ thông tin gốc của một Trip bao gồm Vehicle và danh sách đơn hàng đã gán
   * Mục đích: tính tổng tải trọng, cự ly và lấy emission factor của loại xe phục vụ cho ISO 14083 calc.
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
   * Lưu lại file ghi nhận CO2 (EmissionLog) và các phân bổ cho đơn hàng (Allocations) trong một giao dịch.
   * Đồng thời gỡ bỏ cờ isLatest của version trước (nếu có version cũ).
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
   * Lấy lịch sử Logs của chuyến xe, version mới nhất ưu tiên đầu.
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

  getDateRange(dateRange: GreenTechDashboardQueryType['dateRange']) {
    const endDate = new Date()
    const startDate = new Date(endDate)

    if (dateRange === '7d') startDate.setDate(endDate.getDate() - 7)
    else if (dateRange === '90d') startDate.setDate(endDate.getDate() - 90)
    else if (dateRange === '1y') startDate.setFullYear(endDate.getFullYear() - 1)
    else startDate.setDate(endDate.getDate() - 30)

    return { startDate, endDate }
  }

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
