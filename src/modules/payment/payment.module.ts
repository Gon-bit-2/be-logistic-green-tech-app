import { Module } from '@nestjs/common'
import { PaymentController } from './controller/payment.controller'
import { PaymentService } from './service/payment.service'
import { PaymentRepository } from './repository/payment.repo'
import { PrismaService } from 'src/database/prisma.service'

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, PaymentRepository, PrismaService],
  exports: [PaymentService],
})
export class PaymentModule {}
