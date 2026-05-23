import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { generateTrackingCode } from 'src/common/utils/genTrackingCode'
import { PrismaService } from 'src/database/prisma.service'
import { CreateOrderBodyType, GetOrderListQueryType } from 'src/modules/orders/model/order.model'

const paymentSummarySelect = {
  payment: {
    select: {
      amount: true,
      method: true,
      orderId: true,
      paidAt: true,
      status: true,
      transactionId: true,
    },
  },
} as const

const orderListSelect = {
  id: true,
  trackingCode: true,
  customerId: true,
  senderName: true,
  senderPhone: true,
  senderAddress: true,
  senderLat: true,
  senderLng: true,
  receiverName: true,
  receiverAddress: true,
  receiverLat: true,
  receiverLng: true,
  status: true,
  serviceType: true,
  preferredDeliveryTimeStart: true,
  preferredDeliveryTimeEnd: true,
  totalWeight: true,
  totalVolume: true,
  shippingFee: true,
  estimatedCo2Saved: true,
  currentHubId: true,
  currentTripId: true,
  createdAt: true,
  updatedAt: true,
} as const

/**
 * Repository wrapping database operations for Order entities using Prisma.
 * Kho lưu trữ bao bọc các hoạt động cơ sở dữ liệu cho các thực thể Đơn hàng sử dụng Prisma.
 */
@Injectable()
export class OrderRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Creates a new Order database record including order items and payment structures inside a transaction.
   * Tạo bản ghi cơ sở dữ liệu Đơn hàng mới bao gồm các mặt hàng và cấu trúc thanh toán trong một giao dịch.
   *
   * @param {number} createdById - Authenticated creator ID.
   * @param {number} createdById - ID của người tạo đã xác thực.
   * @param {number} customerId - Target customer ID.
   * @param {number} customerId - ID khách hàng mục tiêu.
   * @param {CreateOrderBodyType} payload - Item lists and shipping addresses.
   * @param {CreateOrderBodyType} payload - Danh sách mặt hàng và địa chỉ giao hàng.
   * @param {object} calculatedData - Pre-calculated metrics such as weight, volumes, fees, and carbon metrics.
   * @param {object} calculatedData - Các chỉ số đã tính toán trước như trọng lượng, thể tích, phí và lượng CO2.
   * @returns Created order entity with items and payment details.
   * @returns Thực thể đơn hàng đã tạo kèm chi tiết các mặt hàng và thanh toán.
   */
  async create(
    createdById: number,
    customerId: number,
    payload: CreateOrderBodyType,
    calculatedData: {
      totalWeight: number
      totalVolume: number
      shippingFee: number
      estimatedCo2Saved: number
      currentHubId: number | null
      paymentMethod: 'STRIPE' | 'COD'
    },
  ) {
    const { items, paymentMethod: _paymentMethod, ...restPayload } = payload
    const { paymentMethod: calculatedPaymentMethod, ...orderCalculatedData } = calculatedData
    const normalizedAmount = Number(calculatedData.shippingFee)
    const shouldUseCod = calculatedPaymentMethod === 'COD'

    return this.prismaService.order.create({
      data: {
        ...restPayload,
        ...orderCalculatedData,
        trackingCode: generateTrackingCode(),
        codAmount: shouldUseCod ? normalizedAmount : 0,
        createdById,
        customerId,
        items: {
          create: items,
        },
        payment: {
          create: {
            amount: normalizedAmount,
            method: calculatedPaymentMethod,
            status: 'PENDING',
            createdById,
          },
        },
      },
      include: {
        items: true,
        ...paymentSummarySelect,
      },
    })
  }

  /**
   * Searches and filters orders with advanced pagination.
   * Tìm kiếm và lọc các đơn hàng với phân trang nâng cao.
   *
   * Supports text search over tracking codes, sender/receiver details, and status/hub filters.
   * Hỗ trợ tìm kiếm văn bản trên mã vận đơn, thông tin người gửi/nhận, và bộ lọc trạng thái/Hub.
   *
   * @param {GetOrderListQueryType & { customerId?: number; currentHubId?: number }} query - Advanced query parameters.
   * @param {GetOrderListQueryType & { customerId?: number; currentHubId?: number }} query - Các tham số truy vấn nâng cao.
   * @returns Paginated results.
   * @returns Kết quả phân trang.
   */
  async findAll(query: GetOrderListQueryType & { customerId?: number; currentHubId?: number }) {
    const { limit, page, status, customerId, currentHubId, search, trackingCode } = query
    const skip = (page - 1) * limit
    const take = limit

    const whereParams: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(trackingCode
        ? {
            trackingCode: {
              equals: trackingCode,
              mode: 'insensitive' as const,
            },
          }
        : search && {
            OR: [
              { trackingCode: { contains: search, mode: 'insensitive' as const } },
              { senderName: { contains: search, mode: 'insensitive' as const } },
              { receiverName: { contains: search, mode: 'insensitive' as const } },
              { senderAddress: { contains: search, mode: 'insensitive' as const } },
              { receiverAddress: { contains: search, mode: 'insensitive' as const } },
            ],
          }),
      ...(status && { status }),
      ...(customerId && { customerId }),
      ...(currentHubId && { currentHubId }),
    }

    const [totalItems, data] = await Promise.all([
      this.prismaService.order.count({
        where: whereParams,
      }),
      this.prismaService.order.findMany({
        where: whereParams,
        select: orderListSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])
    return {
      totalItems,
      data,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit),
    }
  }

  /**
   * Finds a single active order details.
   * Tìm kiếm chi tiết một đơn hàng đang hoạt động.
   *
   * @param {number} id - Order ID.
   * @param {number} id - ID đơn hàng.
   * @returns The resolved order or null.
   * @returns Đơn hàng tìm thấy hoặc null.
   */
  async findById(id: number) {
    return this.prismaService.order.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        items: true,
        ...paymentSummarySelect,
      },
    })
  }

  /**
   * Deletes an order record permanently (hard) or registers a soft deletion.
   * Xóa vĩnh viễn (cứng) bản ghi đơn hàng hoặc đăng ký một xóa mềm.
   *
   * @param {object} params - Target order ID and actor ID.
   * @param {object} params - ID đơn hàng mục tiêu và ID tác nhân.
   * @param {boolean} isHard - True to hard delete from database.
   * @param {boolean} isHard - Chọn true để xóa cứng khỏi cơ sở dữ liệu.
   * @returns The deleted or updated order record.
   * @returns Bản ghi đơn hàng đã bị xóa hoặc cập nhật.
   */
  async delete({ id, deletedById }: { id: number; deletedById: number }, isHard?: boolean) {
    if (isHard) {
      return this.prismaService.order.delete({
        where: {
          id,
        },
        include: {
          items: true,
          ...paymentSummarySelect,
        },
      })
    }
    return this.prismaService.order.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
        deletedById,
      },
      include: {
        items: true,
        ...paymentSummarySelect,
      },
    })
  }
}
