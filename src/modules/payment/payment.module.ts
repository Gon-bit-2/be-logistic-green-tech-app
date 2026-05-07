import { Module } from '@nestjs/common'
import { PaymentController } from './controller/payment.controller'
import { PaymentService } from './service/payment.service'
import { PaymentRepository } from './repository/payment.repo'
import { SharedServicesModule } from 'src/common/services/shared-services.module'
import { DatabaseModule } from 'src/database/database.module'

@Module({
  imports: [DatabaseModule, SharedServicesModule],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentRepository],
  exports: [PaymentService],
})
export class PaymentModule {}
