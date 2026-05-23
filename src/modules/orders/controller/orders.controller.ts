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

/**
 * Controller managing HTTP endpoints for ordering services.
 * Controller quản lý các endpoint HTTP cho dịch vụ đơn hàng.
 *
 * Implements CRUD actions, shipping rate quotes, order creations,
 * cancellation logic, and hub/owner based resource access guards.
 * Triển khai các hoạt động CRUD, báo giá vận chuyển, tạo đơn hàng,
 * logic hủy đơn và các guard truy cập tài nguyên dựa trên Hub hoặc chủ sở hữu.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Calculates delivery fees and ETAs without creating a database record.
   * Tính phí vận chuyển & thời gian dự kiến (không tạo đơn hàng).
   *
   * Rate limited: 10 requests per 60 seconds.
   * Giới hạn tần suất: 10 request / 60 giây — ngăn chặn spam request liên tục.
   *
   * @param {OrderQuoteBodyDto} payload - Address coordinates and cargo details.
   * @param {OrderQuoteBodyDto} payload - Tọa độ địa chỉ và thông tin hàng hóa.
   * @returns Shipping details, including estimated fees and CO2 savings.
   * @returns Thông tin chi tiết vận chuyển, bao gồm phí dự kiến và lượng CO2 tiết kiệm.
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
   * Creates a new order database record and triggers events.
   * Tạo đơn hàng mới trong cơ sở dữ liệu và kích hoạt các sự kiện liên quan.
   *
   * Rate limited: 5 requests per 60 seconds to prevent spam.
   * Giới hạn tần suất: 5 request / 60 giây — ngăn chặn tạo đơn spam.
   *
   * @param {CreateOrderDto} createOrderDto - Cargo data and delivery details.
   * @param {CreateOrderDto} createOrderDto - Dữ liệu hàng hóa và thông tin chi tiết giao hàng.
   * @param {number} userId - The authenticated actor's user ID.
   * @param {number} userId - ID của người dùng thực hiện đã xác thực.
   * @returns The resolved order object with items.
   * @returns Đối tượng đơn hàng đã tạo kèm danh sách mặt hàng.
   */
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(CreateOrderResDto)
  create(@Body() createOrderDto: CreateOrderDto, @ActiveUser('userId') userId: number) {
    const customerId = createOrderDto.customerId || userId
    return this.ordersService.create(userId, customerId, createOrderDto)
  }

  /**
   * Retrieves a paginated list of orders matching query filters.
   * Lấy danh sách đơn hàng được phân trang khớp với các bộ lọc truy vấn.
   *
   * Filters by role visibility constraints: customers see only their own,
   * warehouse staff see only hub-related orders.
   * Lọc theo ràng buộc hiển thị vai trò: khách hàng chỉ thấy đơn của mình,
   * nhân viên kho chỉ thấy đơn thuộc kho của họ.
   *
   * @param {GetOrderListDto} query - Query parameters (page, limit, status, search).
   * @param {GetOrderListDto} query - Tham số truy vấn (trang, giới hạn, trạng thái, tìm kiếm).
   * @param {AccessTokenPayload} user - Authenticated user session payload.
   * @param {AccessTokenPayload} user - Payload phiên người dùng đã xác thực.
   * @returns Paginated list containing orders and total metrics.
   * @returns Danh sách phân trang chứa các đơn hàng và số liệu tổng hợp.
   */
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

  /**
   * Retrieves full details of a specific order by its ID.
   * Lấy thông tin chi tiết đầy đủ của một đơn hàng cụ thể theo ID.
   *
   * @param {number} id - Order database ID.
   * @param {number} id - ID đơn hàng trong cơ sở dữ liệu.
   * @returns The found order record with items and payment status.
   * @returns Bản ghi đơn hàng tìm thấy kèm chi tiết các mặt hàng và trạng thái thanh toán.
   */
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

  /**
   * Updates an order's status and transitions its lifecycle state.
   * Cập nhật trạng thái và chuyển đổi vòng đời của một đơn hàng.
   *
   * @param {number} id - Order database ID.
   * @param {number} id - ID đơn hàng trong cơ sở dữ liệu.
   * @param {UpdateOrderStatusDto} payload - Target state parameters.
   * @param {UpdateOrderStatusDto} payload - Tham số trạng thái đích.
   * @param {AccessTokenPayload} user - Context actor payload.
   * @param {AccessTokenPayload} user - Payload của tác nhân thực hiện.
   * @returns The updated order database record.
   * @returns Bản ghi đơn hàng đã cập nhật trong cơ sở dữ liệu.
   */
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

  /**
   * Performs status transition to CANCELLED for a specific order.
   * Thực hiện chuyển đổi trạng thái của đơn hàng cụ thể sang CANCELLED.
   *
   * Validates cancellation eligibility constraints based on current status.
   * Xác thực các điều kiện được phép hủy dựa trên trạng thái hiện tại.
   *
   * @param {number} id - Order database ID.
   * @param {number} id - ID đơn hàng trong cơ sở dữ liệu.
   * @param {AccessTokenPayload} user - Authenticated context actor.
   * @param {AccessTokenPayload} user - Tác nhân ngữ cảnh đã xác thực.
   * @returns The cancelled order record.
   * @returns Bản ghi đơn hàng đã được hủy.
   */
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

  /**
   * Performs soft deletion on an order by setting its deletedAt timestamp.
   * Thực hiện xóa mềm một đơn hàng bằng cách thiết lập dấu thời gian deletedAt.
   *
   * @param {number} id - Order database ID.
   * @param {number} id - ID đơn hàng trong cơ sở dữ liệu.
   * @param {number} userId - Actor ID requesting deletion.
   * @param {number} userId - ID tác nhân yêu cầu xóa đơn hàng.
   * @returns The deleted order record details.
   * @returns Chi tiết bản ghi đơn hàng đã bị xóa.
   */
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
