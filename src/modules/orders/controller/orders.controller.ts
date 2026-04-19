import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe, Put, Query } from '@nestjs/common'
import { OrdersService } from '../service/orders.service'
import { CreateOrderDto, GetOrderListDto, UpdateOrderStatusDto } from '../dto/order.dto'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { ResourceAccess } from 'src/common/decorators/resource-access.decorator'
import { IsAdmin, IsCustomer, IsWarehouseStaff } from 'src/common/decorators/roles.decorator'

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() createOrderDto: CreateOrderDto, @ActiveUser('userId') userId: number) {
    const customerId = createOrderDto.customerId || userId
    return this.ordersService.create(userId, customerId, createOrderDto)
  }

  @Get()
  findAll(@Query() query: GetOrderListDto) {
    return this.ordersService.findAll(query)
  }

  @Get(':id')
  @ResourceAccess({
    model: 'order',
    paramName: 'id',
    ownerField: 'customerId', // CUSTOMER chỉ được xem đơn hàng của mình
    hubField: 'currentHubId',  // WAREHOUSE_STAFF chỉ được xem đơn hàng tại kho của mình
  })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findById(id)
  }
  @Put(':id/status')
  @ResourceAccess({
    model: 'order',
    paramName: 'id',
    ownerField: 'customerId', 
    hubField: 'currentHubId',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateOrderStatusDto, // Define class DTO từ UpdateOrderStatusSchema
  ) {
    return this.ordersService.update(id, payload)
  }
  @Delete(':id')
  @ResourceAccess({
    model: 'order',
    paramName: 'id',
    ownerField: 'customerId',
    hubField: 'currentHubId',
  })
  delete(@Param('id', ParseIntPipe) id: number, @ActiveUser('userId') userId: number) {
    return this.ordersService.delete(id, userId)
  }
}
