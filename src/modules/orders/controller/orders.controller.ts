import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe, Put, Query } from '@nestjs/common'
import { OrdersService } from '../service/orders.service'
import { CreateOrderDto, GetOrderListDto, UpdateOrderStatusDto, OrderQuoteBodyDto } from '../dto/order.dto'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { ResourceAccess } from 'src/common/decorators/resource-access.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/types/jwt.type'

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('quote')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  quote(@Body() payload: OrderQuoteBodyDto) {
    return this.ordersService.quote(payload)
  }

  @Post()
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  create(@Body() createOrderDto: CreateOrderDto, @ActiveUser('userId') userId: number) {
    const customerId = createOrderDto.customerId || userId
    return this.ordersService.create(userId, customerId, createOrderDto)
  }

  @Get()
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  findAll(@Query() query: GetOrderListDto, @ActiveUser() user: AccessTokenPayload) {
    let customerId: number | undefined
    if (user.roleName === roleName.CUSTOMER) {
      customerId = user.userId
    }
    return this.ordersService.findAll({ ...query, customerId })
  }

  @Get(':id')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ResourceAccess({
    model: 'order',
    paramName: 'id',
    ownerField: 'customerId', // CUSTOMER chỉ được xem đơn hàng của mình
    hubField: 'currentHubId', // WAREHOUSE_STAFF chỉ được xem đơn hàng tại kho của mình
  })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findById(id)
  }
  @Put(':id/status')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
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
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
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
