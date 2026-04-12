import { createZodDto } from 'nestjs-zod'
import {
  CancelOrderResSchema,
  CreateOrderBodyResSchema,
  CreateOrderBodySchema,
  GetOrderDetailResSchema,
  GetOrderListQuerySchema,
  GetOrderParamsSchema,
  UpdateOrderStatusSchema,
} from '../model/order.model'

export class CreateOrderDto extends createZodDto(CreateOrderBodySchema) {}

export class GetOrderListDto extends createZodDto(GetOrderListQuerySchema) {}

export class GetOrderDetailDto extends createZodDto(GetOrderDetailResSchema) {}

export class CancelOrderResDto extends createZodDto(CancelOrderResSchema) {}

export class UpdateOrderStatusDto extends createZodDto(UpdateOrderStatusSchema) {}

export class GetOrderParamsDto extends createZodDto(GetOrderParamsSchema) {}

export class CreateOrderResDto extends createZodDto(CreateOrderBodyResSchema) {}
