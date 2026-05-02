import { Module } from '@nestjs/common'
import { PaymentController } from './controller/payment.controller'
import { PaymentService } from './service/payment.service'
import { PaymentRepository } from './repository/payment.repo'

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, PaymentRepository],
  exports: [PaymentService],
})
export class PaymentModule {}
