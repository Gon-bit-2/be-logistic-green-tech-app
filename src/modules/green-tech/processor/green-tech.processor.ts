import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { GreenTechService } from '../service/green-tech.service'
import { GREEN_TECH_QUEUE_NAME, CALCULATE_EMISSION_JOB_NAME } from 'src/common/constants/queue.constant'

type CalculateEmissionJobData = {
  tripId: number
}

/**
 * BullMQ Worker Processor for computing carbon emissions and green tech metrics in the background.
 * 
 * Worker Processor của BullMQ để tính toán lượng khí thải carbon và các chỉ số công nghệ xanh chạy ngầm.
 */
@Processor(GREEN_TECH_QUEUE_NAME)
export class GreenTechProcessor extends WorkerHost {
  private readonly logger = new Logger(GreenTechProcessor.name)

  /**
   * Initializes the GreenTechProcessor.
   * 
   * Khởi tạo GreenTechProcessor.
   * 
   * @param greenTechService - Core GreenTech Service / Dịch vụ công nghệ xanh cốt lõi.
   */
  constructor(private readonly greenTechService: GreenTechService) {
    super()
  }

  /**
   * Processes a background emission calculation job from BullMQ.
   * Calculates actual and saved CO2 emissions and updates sustainability databases.
   * 
   * Xử lý một công việc tính toán phát thải chạy ngầm từ BullMQ.
   * Tính toán lượng CO2 phát thải thực tế, tiết kiệm được và cập nhật cơ sở dữ liệu bền vững.
   * 
   * @param job - The BullMQ job object containing trip ID / Đối tượng job BullMQ chứa ID chuyến đi.
   * @returns Detailed emissions log snapshot details / Chi tiết thông tin bản ghi phát thải được tính toán.
   * @throws Error if trip ID is missing or service execution fails / Error nếu thiếu ID chuyến đi hoặc dịch vụ thực thi thất bại.
   */
  async process(
    job: Job<CalculateEmissionJobData, Awaited<ReturnType<GreenTechService['calculateTripEmission']>>, string>,
  ) {
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Job [${job.name}] thất bại: ${message}`)
      throw error // Re-throw để BullMQ ghi nhận lỗi và có thể thử lại
    }
  }
}
