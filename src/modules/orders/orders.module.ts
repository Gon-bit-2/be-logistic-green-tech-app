import { Module } from '@nestjs/common'
import { OrdersController } from './controller/orders.controller'
import { OrdersService } from 'src/modules/orders/service/orders.service'
import { PrismaService } from 'src/database/prisma.service'
import { OrderRepository } from './repository/order.repo'
import { MapsModule } from 'src/modules/maps/maps.module'
import { TrackingRepository } from 'src/modules/tracking/repository/tracking.repo'

@Module({
  imports: [MapsModule],
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService, OrderRepository, TrackingRepository],
})
export class OrdersModule {}
