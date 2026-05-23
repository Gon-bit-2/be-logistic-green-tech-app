import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'

/**
 * Repository class for managing OrderTrackingEvent database queries.
 * Interfaces directly with Prisma to fetch timelines and compute delivery attempt tallies.
 *
 * Lớp repository chịu trách nhiệm quản lý các truy vấn cơ sở dữ liệu OrderTrackingEvent.
 * Giao tiếp trực tiếp với Prisma để truy xuất dòng thời gian và tính toán số lần giao hàng.
 */
@Injectable()
export class TrackingRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Retrieves the complete list of tracking events for an order, sorted by occurrence time.
   * Includes associated Proof of Delivery (POD) details and actor metadata.
   *
   * Lấy danh sách đầy đủ các sự kiện định vị của một đơn hàng, sắp xếp theo thời gian xảy ra.
   * Bao gồm các chi tiết về Bằng chứng giao hàng (POD) liên quan và siêu dữ liệu tác nhân thực hiện.
   *
   * @param orderId The unique identifier of the order.
   *                Mã định danh duy nhất của đơn hàng.
   * @returns A promise resolving to the tracking events array.
   *          Một promise trả về mảng các sự kiện định vị.
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
   * Retrieves the most recent status transition (STATUS_CHANGE) event recorded for an order.
   * Used for state validation before performing subsequent status transitions.
   *
   * Lấy sự kiện chuyển đổi trạng thái (STATUS_CHANGE) gần đây nhất được ghi nhận cho một đơn hàng.
   * Được sử dụng để xác thực trạng thái trước khi thực hiện các chuyển đổi trạng thái tiếp theo.
   *
   * @param orderId The unique identifier of the order.
   *                Mã định danh duy nhất của đơn hàng.
   * @returns A promise resolving to the latest status change event.
   *          Một promise trả về sự kiện thay đổi trạng thái mới nhất.
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
   * Tallies the total number of failed delivery attempts (EXCEPTION events with failure reason codes) for an order.
   * Used to assert compliance against maximum delivery attempt thresholds.
   *
   * Đếm tổng số lần giao hàng thất bại (các sự kiện EXCEPTION có kèm mã lý do thất bại) cho một đơn hàng.
   * Được sử dụng để xác minh việc tuân thủ các ngưỡng giới hạn giao hàng tối đa.
   *
   * @param orderId The unique identifier of the order.
   *                Mã định danh duy nhất của đơn hàng.
   * @returns A promise resolving to the total failed attempt count.
   *          Một promise trả về tổng số lần giao thất bại.
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
