import { createZodDto } from 'nestjs-zod'
import {
  CancelOrderResSchema,
  CreateOrderBodyResSchema,
  CreateOrderBodySchema,
  GetOrderDetailResSchema,
  GetOrderListQuerySchema,
  GetOrderListResSchema,
  GetOrderParamsSchema,
  UpdateOrderStatusSchema,
  OrderQuoteBodySchema,
  OrderQuoteResSchema,
} from '../model/order.model'

export class OrderQuoteBodyDto extends createZodDto(OrderQuoteBodySchema, { codec: true }) {}
export class OrderQuoteResDto extends createZodDto(OrderQuoteResSchema) {}

export class CreateOrderDto extends createZodDto(CreateOrderBodySchema, { codec: true }) {}

export class GetOrderListDto extends createZodDto(GetOrderListQuerySchema) {}

export class GetOrderListResDto extends createZodDto(GetOrderListResSchema, { codec: true }) {}

export class GetOrderDetailDto extends createZodDto(GetOrderDetailResSchema, { codec: true }) {}

export class CancelOrderResDto extends createZodDto(CancelOrderResSchema, { codec: true }) {}

export class UpdateOrderStatusDto extends createZodDto(UpdateOrderStatusSchema) {}

export class GetOrderParamsDto extends createZodDto(GetOrderParamsSchema) {}

export class CreateOrderResDto extends createZodDto(CreateOrderBodyResSchema, { codec: true }) {}
