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
   */
  async autoDispatchLocalTask(hubId: number) {
    // BullMQ enqueue
    const job = await this.autoDispatchQueue.add('dispatch-local', { hubId })

    return {
      message: `Đã đưa yêu cầu gom chuyến cho Hub ${hubId} vào hàng đợi xử lý ngầm.`,
      jobId: job.id,
    }
  }

  /**
   * Khi gọi trigger Global, Service đẩy (fan-out) N jobs cho N hubs tương ứng để chạy song song.
   */
  async autoDispatchGlobalTask() {
    const activeHubs = await this.prismaService.hub.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
    })

    if (!activeHubs.length) {
      throw new NotFoundException('Không có Hub nào đang hoạt động trong hệ thống.')
    }

    // Chèn hàng loạt Job vào Queue
    const jobsToQueue = activeHubs.map((hub) => ({
      name: 'dispatch-local',
      data: { hubId: hub.id },
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

    // Gọi repo chuyển status
    return this.stripRepo.updateTripStatus(id, status)
  }
}
