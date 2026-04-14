import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { StripRepository } from '../repository/trip.repository'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { PrismaService } from 'src/database/prisma.service'
import { GetTripListQueryType } from '../model/trip.model'
import { TripStatusType } from 'src/common/constants/strip.constant'

@Injectable()
export class StripsService {
  constructor(
    @InjectQueue(AUTO_DISPATCH_QUEUE_NAME)
    private readonly autoDispatchQueue: Queue,
    private readonly stripRepo: StripRepository,
    private readonly prismaService: PrismaService, // Dùng để fetch danh sách Hub khi chạy Global
  ) {}

  /**
   * Truyền 1 Hub id vào Queue để worker ngầm xử lý riêng cho cụm Hub này.
   * Sử dụng jobId cố định theo hubId để BullMQ tự chặn duplicate job.
   */
  async autoDispatchLocalTask(hubId: number) {
    const jobId = `dispatch-hub-${hubId}`

    // BullMQ enqueue với jobId cố định → nếu job trùng ID đang pending/active thì bị reject
    const job = await this.autoDispatchQueue.add('dispatch-local', { hubId }, { jobId })

    return {
      message: `Đã đưa yêu cầu gom chuyến cho Hub ${hubId} vào hàng đợi xử lý ngầm.`,
      jobId: job.id,
    }
  }

  /**
   * Khi gọi trigger Global, Service đẩy (fan-out) N jobs cho N hubs tương ứng để chạy song song.
   * Mỗi job dùng jobId riêng theo hubId để tránh duplicate.
   */
  async autoDispatchGlobalTask() {
    const activeHubs = await this.prismaService.hub.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
    })

    if (!activeHubs.length) {
      throw new NotFoundException('Không có Hub nào đang hoạt động trong hệ thống.')
    }

    // Chèn hàng loạt Job vào Queue, mỗi Hub 1 jobId riêng biệt
    const jobsToQueue = activeHubs.map((hub) => ({
      name: 'dispatch-local',
      data: { hubId: hub.id },
      opts: { jobId: `dispatch-hub-${hub.id}` },
    }))

    const addedJobs = await this.autoDispatchQueue.addBulk(jobsToQueue)

    return {
      message: `Quá trình gom chuyến toàn hệ thống đã khởi tạo. Hệ thống sẽ tối ưu đồng thời trên ${activeHubs.length} cụm kho trung chuyển.`,
      jobId: addedJobs.map((j) => j.id).join(','), // Trả về list job ID nếu Admin cần debug
    }
  }

  async findAll(query: GetTripListQueryType) {
    return this.stripRepo.findAll(query)
  }

  async findById(id: number) {
    const trip = await this.stripRepo.findById(id)
    if (!trip) {
      throw new NotFoundException(`Không tìm thấy Trip #${id}`)
    }
    return trip
  }

  async updateStatus(id: number, status: TripStatusType) {
    const trip = await this.stripRepo.findById(id)
    if (!trip) throw new NotFoundException(`Trip #${id} không tồn tại`)

    // Nếu chuyển sang COMPLETED → chạy logic nghiệp vụ hoàn thành chuyến xe
    if (status === 'COMPLETED') {
      return this.completeTrip(id)
    }

    // Các trạng thái khác chỉ cần update đơn giản
    return this.stripRepo.updateTripStatus(id, status)
  }

  /**
   * Hoàn thành chuyến xe và xử lý luồng chuyển trạng thái đơn hàng.
   * - Đơn nội ô (DROPOFF)      → DELIVERED
   * - Đơn liên tỉnh (HUB_TRANSFER) → ARRIVED_AT_HUB + chuyển sang Hub đích
   *   → Đơn tự động hiện trong lượt dispatch tiếp ở Hub đích (khép kín vòng lặp)
   */
  private async completeTrip(tripId: number) {
    // Lấy danh sách tất cả Hub active để tìm Hub đích cho đơn liên tỉnh
    const allHubs = await this.prismaService.hub.findMany({
      where: { isActive: true, deletedAt: null },
      select: { 
        id: true, 
        latitude: true, 
        longitude: true,
        capacityVolume: true,
        ordersCurrentlyHere: {
          select: { totalVolume: true } // Lấy thể tích các đơn đang tồn kho để check sức chứa
        }
      },
    })

    return this.stripRepo.completeTrip(tripId, allHubs)
  }

  /**
   * Hủy đơn hàng giữa chuyến xe.
   * Cập nhật trạng thái Trip và Order an toàn trong Transaction.
   */
  async cancelOrderFromTrip(tripId: number, orderId: number) {
    const trip = await this.stripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Trip #${tripId} không tồn tại`)

    // Gọi repo hủy đơn, reindex các stop sequence và có thể tự hủy trip luôn
    return this.stripRepo.cancelOrderFromTrip(tripId, orderId)
  }
}
