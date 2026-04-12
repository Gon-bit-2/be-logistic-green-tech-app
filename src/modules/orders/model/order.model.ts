import { ORDER_STATUS, SERVICE_TYPE } from 'src/common/constants/order.constant'
import { PaginationQuerySchema } from 'src/common/model/request.model'
import z from 'zod'

export const OrderStatusSchema = z.enum([
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.IN_TRANSIT,
  ORDER_STATUS.ARRIVED_AT_HUB,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
])

export const ServiceTypeSchema = z.enum([SERVICE_TYPE.EXPRESS, SERVICE_TYPE.STANDARD, SERVICE_TYPE.ECO_GREEN])

export const OrderItemSchema = z.object({
  id: z.number().optional(),
  orderId: z.number().optional(),
  name: z.string(),
  quantity: z.number().int().positive().default(1),
  weight: z.number().positive(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
})

export const OrderSchema = z.object({
  id: z.number(),
  trackingCode: z.string(),
  customerId: z.number(),
  senderName: z.string(),
  senderPhone: z.string(),
  senderAddress: z.string(),
  senderLat: z.number(),
  senderLng: z.number(),
  receiverName: z.string(),
  receiverPhone: z.string(),
  receiverAddress: z.string(),
  receiverLat: z.number(),
  receiverLng: z.number(),
  status: OrderStatusSchema,
  serviceType: ServiceTypeSchema,
  totalWeight: z.number(),
  totalVolume: z.number(),
  shippingFee: z.number(),
  estimatedCo2Saved: z.number().optional(),
  currentHubId: z.number().optional(),
  currentTripId: z.number().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().optional(),
  createdById: z.number().optional(),
  updatedById: z.number().optional(),
  deletedById: z.number().optional(),
})

// Chuẩn hoá Response DTO (Loại bỏ các trường audit để bảo mật và mở rộng item con)
export const OrderResponseSchema = OrderSchema.omit({
  deletedAt: true,
  deletedById: true,
  createdById: true,
  updatedById: true,
}).extend({
  items: z.array(OrderItemSchema).optional(),
})

export const GetOrderListResSchema = z.object({
  data: z.array(
    OrderResponseSchema.omit({
      // Giấu bớt thông tin nhạy cảm ở dạng List Grid
      receiverPhone: true,
      receiverAddress: true,
      receiverLat: true,
      receiverLng: true,
    }),
  ),
  totalItems: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
})

export const GetOrderListQuerySchema = PaginationQuerySchema.extend({
  status: OrderStatusSchema.optional(),
})

export const GetOrderDetailResSchema = OrderResponseSchema

// 🚀 Thiết kế CreateOrderBodySchema theo chuẩn Clean Architecture
export const CreateOrderBodySchema = z.object({
  customerId: z.number().int().positive().optional(),

  senderName: z.string().min(1, 'Tên người gửi không được để trống'),
  senderPhone: z.string().min(10, 'Số điện thoại không hợp lệ'),
  senderAddress: z.string().min(5, 'Địa chỉ người gửi không hợp lệ'),
  senderLat: z.number(),
  senderLng: z.number(),

  receiverName: z.string().min(1, 'Tên người nhận không được để trống'),
  receiverPhone: z.string().min(10, 'Số điện thoại không hợp lệ'),
  receiverAddress: z.string().min(5, 'Địa chỉ người nhận không hợp lệ'),
  receiverLat: z.number(),
  receiverLng: z.number(),

  serviceType: ServiceTypeSchema.default(SERVICE_TYPE.STANDARD),

  items: z.array(OrderItemSchema.omit({ id: true, orderId: true })).min(1, 'Đơn hàng phải có ít nhất 1 món hàng'),
})

// Trả về DTO sạch sau khi tạo xong 1 đơn hàng
export const CreateOrderBodyResSchema = z.object({
  order: OrderResponseSchema,
})

export const CancelOrderResSchema = OrderResponseSchema

export const GetOrderParamsSchema = z
  .object({
    orderId: z.coerce.number().int().positive(),
  })
  .strict()

export const UpdateOrderStatusSchema = z.object({
  status: OrderStatusSchema,
})

export type OrderType = z.infer<typeof OrderSchema>
export type OrderResponseType = z.infer<typeof OrderResponseSchema>
export type OrderItemType = z.infer<typeof OrderItemSchema>
export type CreateOrderBodyType = z.infer<typeof CreateOrderBodySchema>
export type CreateOrderBodyResType = z.infer<typeof CreateOrderBodyResSchema>
export type GetOrderListResType = z.infer<typeof GetOrderListResSchema>
export type GetOrderListQueryType = z.infer<typeof GetOrderListQuerySchema>
export type GetOrderDetailResType = z.infer<typeof GetOrderDetailResSchema>
export type CancelOrderResType = z.infer<typeof CancelOrderResSchema>
export type GetOrderParamsType = z.infer<typeof GetOrderParamsSchema>
export type UpdateOrderStatusType = z.infer<typeof UpdateOrderStatusSchema>
