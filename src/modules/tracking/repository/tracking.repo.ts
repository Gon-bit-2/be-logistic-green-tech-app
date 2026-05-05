import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class TrackingRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Lấy timeline tracking của 1 đơn hàng (sort theo thời gian xảy ra)
   * Include POD + images nếu có
   */
  async findByOrderId(orderId: number) {
    return this.prismaService.orderTrackingEvent.findMany({
      where: { orderId },
      include: {
        pod: {
          include: {
            images: true,
          },
        },
        createdBy: {
          select: { id: true, fullName: true, role: { select: { name: true } } },
        },
      },
      orderBy: { occurredAt: 'asc' },
    })
  }

  /**
   * Lấy event mới nhất có STATUS_CHANGE của 1 đơn
   * Dùng để kiểm tra trạng thái hiện tại trước khi chuyển trạng thái mới
   */
  async findLatestStatusEvent(orderId: number) {
    return this.prismaService.orderTrackingEvent.findFirst({
      where: {
        orderId,
        eventType: 'STATUS_CHANGE',
      },
      orderBy: { occurredAt: 'desc' },
    })
  }

  /**
   * Đếm số lần giao thất bại (EXCEPTION) cho 1 đơn
   * Dùng để check đã vượt MAX_DELIVERY_ATTEMPTS chưa
   */
  async countFailedAttempts(orderId: number): Promise<number> {
    return this.prismaService.orderTrackingEvent.count({
      where: {
        orderId,
        eventType: 'EXCEPTION',
        failureReasonCode: { not: null },
      },
    })
  }
}
