import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  Put,
  Query,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { OrdersService } from '../service/orders.service'
import {
  CancelOrderResDto,
  CreateOrderDto,
  CreateOrderResDto,
  GetOrderDetailDto,
  GetOrderListDto,
  GetOrderListResDto,
  OrderQuoteBodyDto,
  OrderQuoteResDto,
  UpdateOrderStatusDto,
} from '../dto/order.dto'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { ResourceAccess } from 'src/common/decorators/resource-access.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Tính phí vận chuyển & thời gian dự kiến (không tạo đơn).
   * Rate limit: 10 request / 60 giây — ngăn chặn spam request liên tục.
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(OrderQuoteResDto)
  quote(@Body() payload: OrderQuoteBodyDto) {
    return this.ordersService.quote(payload)
  }

  /**
   * Tạo đơn hàng mới.
   * Rate limit: 5 request / 60 giây — ngăn chặn tạo đơn spam
   * (1 user bình thường không cần tạo quá 5 đơn/phút).
   */
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(CreateOrderResDto)
  create(@Body() createOrderDto: CreateOrderDto, @ActiveUser('userId') userId: number) {
    const customerId = createOrderDto.customerId || userId
    return this.ordersService.create(userId, customerId, createOrderDto)
  }

  @Get()
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(GetOrderListResDto)
  findAll(@Query() query: GetOrderListDto, @ActiveUser() user: AccessTokenPayload) {
    let customerId: number | undefined
    if (user.roleName === roleName.CUSTOMER) {
      customerId = user.userId
    }
    return this.ordersService.findAll({ ...query, customerId }, user)
  }

  @Get(':id')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(GetOrderDetailDto)
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
  @ZodSerializerDto(GetOrderDetailDto)
  @ResourceAccess({
    model: 'order',
    paramName: 'id',
    ownerField: 'customerId',
    hubField: 'currentHubId',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateOrderStatusDto, // Define class DTO từ UpdateOrderStatusSchema
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.ordersService.update(id, payload, user)
  }

  @Patch(':id/cancel')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(CancelOrderResDto)
  @ResourceAccess({
    model: 'order',
    paramName: 'id',
    ownerField: 'customerId',
  })
  cancel(@Param('id', ParseIntPipe) id: number, @ActiveUser() user: AccessTokenPayload) {
    return this.ordersService.cancel(id, user)
  }

  @Delete(':id')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(CancelOrderResDto)
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
