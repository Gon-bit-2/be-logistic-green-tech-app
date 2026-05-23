import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Queue } from 'bullmq'
import {
  AUTO_DISPATCH_QUEUE_NAME,
  GREEN_TECH_QUEUE_NAME,
  NOTIFICATION_QUEUE_NAME,
} from 'src/common/constants/queue.constant'
import { PrismaService } from 'src/database/prisma.service'

const OBSERVABILITY_QUEUE_NAMES = [AUTO_DISPATCH_QUEUE_NAME, GREEN_TECH_QUEUE_NAME, NOTIFICATION_QUEUE_NAME] as const

type ObservabilityQueueName = (typeof OBSERVABILITY_QUEUE_NAMES)[number]

/**
 * Service handling system observability and monitoring tasks.
 * Interacts with BullMQ queues to inspect job counts and retrieve failed jobs,
 * and queries Prisma database for slow HTTP requests and system audit logs.
 * 
 * Dịch vụ xử lý các tác vụ giám sát và đo lường hệ thống (Observability).
 * Tương tác với các hàng đợi BullMQ để kiểm tra số lượng công việc và lấy thông tin các công việc bị lỗi,
 * đồng thời truy vấn cơ sở dữ liệu Prisma để tìm kiếm các yêu cầu HTTP chậm và nhật ký kiểm toán hệ thống.
 */
@Injectable()
export class ObservabilityService {
  private readonly queues: Record<ObservabilityQueueName, Queue>

  /**
   * Initializes the ObservabilityService with dependencies and maps monitored BullMQ queues.
   * 
   * Khởi tạo ObservabilityService với các dependency và ánh xạ các hàng đợi BullMQ được giám sát.
   * 
   * @param prisma - Prisma service instance / Instance của dịch vụ Prisma.
   * @param autoDispatchQueue - BullMQ auto-dispatch queue instance / Instance hàng đợi auto-dispatch.
   * @param greenTechQueue - BullMQ green tech queue instance / Instance hàng đợi green-tech.
   * @param notificationQueue - BullMQ notification queue instance / Instance hàng đợi notification.
   */
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AUTO_DISPATCH_QUEUE_NAME) autoDispatchQueue: Queue,
    @InjectQueue(GREEN_TECH_QUEUE_NAME) greenTechQueue: Queue,
    @InjectQueue(NOTIFICATION_QUEUE_NAME) notificationQueue: Queue,
  ) {
    this.queues = {
      [AUTO_DISPATCH_QUEUE_NAME]: autoDispatchQueue,
      [GREEN_TECH_QUEUE_NAME]: greenTechQueue,
      [NOTIFICATION_QUEUE_NAME]: notificationQueue,
    }
  }

  /**
   * Retrieves overall stats for all monitored BullMQ queues.
   * Collects job counts grouped by states (waiting, active, completed, failed, delayed, paused) and checks if the queue is paused.
   * 
   * Lấy số liệu thống kê tổng thể cho tất cả các hàng đợi BullMQ được giám sát.
   * Thu thập số lượng công việc được nhóm theo trạng thái (chờ, đang chạy, đã hoàn thành, lỗi, bị hoãn, bị tạm dừng) và kiểm tra xem hàng đợi có bị tạm dừng hay không.
   * 
   * @returns Detailed statistics for each queue / Số liệu thống kê chi tiết cho từng hàng đợi.
   */
  async getQueues() {
    const data = await Promise.all(
      OBSERVABILITY_QUEUE_NAMES.map(async (name) => {
        const queue = this.queues[name]
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused')
        const isPaused = await queue.isPaused()
        return {
          counts,
          isPaused,
          name,
        }
      }),
    )

    return { data }
  }

  /**
   * Retrieves details of failed jobs for a specific BullMQ queue.
   * 
   * Lấy thông tin chi tiết các công việc bị lỗi trong một hàng đợi BullMQ cụ thể.
   * 
   * @param queueName - The name of target queue / Tên của hàng đợi mục tiêu.
   * @param limit - Maximum number of failed jobs to retrieve (capped between 0 and 100) / Số lượng tối đa công việc lỗi cần lấy (giới hạn từ 0 đến 100).
   * @returns List of failed jobs with error stacks and data details / Danh sách các công việc bị lỗi kèm theo stacktrace lỗi và chi tiết dữ liệu.
   * @throws NotFoundException - If the queue name is invalid or not monitored / Nếu tên hàng đợi không hợp lệ hoặc không được giám sát.
   */
  async getFailedJobs(queueName: string, limit = 25) {
    const queue = this.resolveQueue(queueName)
    const jobs = await queue.getFailed(0, Math.max(0, Math.min(limit, 100) - 1))
    return {
      data: jobs.map((job) => ({
        attemptsMade: job.attemptsMade,
        data: job.data,
        failedReason: job.failedReason,
        finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        id: job.id,
        name: job.name,
        stacktrace: job.stacktrace?.slice(0, 3) ?? [],
        timestamp: new Date(job.timestamp).toISOString(),
      })),
    }
  }

  /**
   * Retrieves logged API endpoints that exceeded defined slow execution thresholds.
   * 
   * Lấy danh sách nhật ký các endpoint API vượt quá ngưỡng thời gian thực thi cho phép (yêu cầu chậm).
   * 
   * @param query - Pagination configuration / Cấu hình phân trang.
   * @param query.limit - Maximum records per page / Số lượng bản ghi tối đa mỗi trang.
   * @param query.page - Current page number / Số trang hiện tại.
   * @returns Paginated list of slow requests / Danh sách phân trang các yêu cầu chậm.
   */
  async getSlowEndpoints(query: { limit?: number; page?: number }) {
    const limit = Math.min(query.limit ?? 25, 100)
    const page = query.page ?? 1
    const skip = (page - 1) * limit
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.slowRequestLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.slowRequestLog.count(),
    ])

    return { data, limit, page, totalItems }
  }

  /**
   * Retrieves system audit logs with pagination and optional entity type filtering.
   * 
   * Lấy danh sách nhật ký kiểm toán (audit logs) của hệ thống với phân trang và bộ lọc loại thực thể tùy chọn.
   * 
   * @param query - Filtering and pagination parameters / Tham số lọc và phân trang.
   * @param query.entityType - Optional entity type filter / Bộ lọc loại thực thể tùy chọn (ví dụ: 'ROLE_REQUEST').
   * @param query.limit - Maximum records per page / Số lượng bản ghi tối đa mỗi trang.
   * @param query.page - Current page number / Số trang hiện tại.
   * @returns Paginated list of audit logs / Danh sách phân trang của nhật ký kiểm toán.
   */
  async getAuditLogs(query: { entityType?: string; limit?: number; page?: number }) {
    const limit = Math.min(query.limit ?? 25, 100)
    const page = query.page ?? 1
    const skip = (page - 1) * limit
    const where = query.entityType ? { entityType: query.entityType } : undefined
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ])

    return { data, limit, page, totalItems }
  }

  /**
   * Resolves a queue instance by its name.
   * Checks if the queue name belongs to monitored system queues.
   * 
   * Ánh xạ instance hàng đợi bằng tên của nó.
   * Kiểm tra xem tên hàng đợi có thuộc danh sách các hàng đợi hệ thống được giám sát hay không.
   * 
   * @param queueName - The queue name / Tên hàng đợi.
   * @returns The BullMQ Queue instance / Instance Queue của BullMQ.
   * @throws NotFoundException - If the queue name is invalid / Nếu tên hàng đợi không hợp lệ.
   */
  private resolveQueue(queueName: string) {
    if (!OBSERVABILITY_QUEUE_NAMES.includes(queueName as ObservabilityQueueName)) {
      throw new NotFoundException('Không tìm thấy queue.')
    }
    return this.queues[queueName as ObservabilityQueueName]
  }
}
