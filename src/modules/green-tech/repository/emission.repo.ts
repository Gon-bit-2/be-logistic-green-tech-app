import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { EmissionLogInput, EmissionAllocationInput } from '../model/emission.model'

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
}
