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

@Injectable()
export class ObservabilityService {
  private readonly queues: Record<ObservabilityQueueName, Queue>

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

  private resolveQueue(queueName: string) {
    if (!OBSERVABILITY_QUEUE_NAMES.includes(queueName as ObservabilityQueueName)) {
      throw new NotFoundException('Không tìm thấy queue.')
    }
    return this.queues[queueName as ObservabilityQueueName]
  }
}
