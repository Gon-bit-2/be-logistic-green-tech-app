import { Module } from '@nestjs/common'
import { OrdersController } from './controller/orders.controller'
import { OrdersService } from 'src/modules/orders/service/orders.service'
import { OrderRepository } from './repository/order.repo'
import { MapsModule } from 'src/modules/maps/maps.module'
import { SharedServicesModule } from 'src/common/services/shared-services.module'
import { DatabaseModule } from 'src/database/database.module'

@Module({
  imports: [DatabaseModule, MapsModule, SharedServicesModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderRepository],
})
export class OrdersModule {}
