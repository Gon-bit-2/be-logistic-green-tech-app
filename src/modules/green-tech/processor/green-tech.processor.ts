import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { GreenTechService } from '../service/green-tech.service'
import { GREEN_TECH_QUEUE_NAME, CALCULATE_EMISSION_JOB_NAME } from 'src/common/constants/queue.constant'

@Processor(GREEN_TECH_QUEUE_NAME)
export class GreenTechProcessor extends WorkerHost {
  private readonly logger = new Logger(GreenTechProcessor.name)

  constructor(private readonly greenTechService: GreenTechService) {
    super()
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`🔄 Bắt đầu xử lý Job [${job.name}] (ID: ${job.id})`)

    try {
      if (job.name === CALCULATE_EMISSION_JOB_NAME) {
        const { tripId } = job.data

        if (!tripId) {
          throw new Error('job.data.tripId bị thiếu')
        }

        const result = await this.greenTechService.calculateTripEmission(tripId)
        this.logger.log(`✅ Tính toán GreenTech thành công cho Trip #${tripId}`)
        return result
      }
    } catch (error) {
      this.logger.error(`❌ Job [${job.name}] thất bại: ${error.message}`)
      throw error // Re-throw để BullMQ ghi nhận lỗi và có thể thử lại
    }
  }
}
