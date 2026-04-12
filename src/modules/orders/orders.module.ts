import { Module } from '@nestjs/common'
import { OrdersController } from './controller/orders.controller'
import { OrdersService } from 'src/modules/orders/service/orders.service'
import { PrismaService } from 'src/database/prisma.service'
import { OrderRepository } from './repository/order.repo'

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService, OrderRepository],
})
export class OrdersModule {}

