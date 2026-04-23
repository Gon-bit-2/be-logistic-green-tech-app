import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { CreateOrderBodyType, GetOrderListQueryType, UpdateOrderStatusType } from 'src/modules/orders/model/order.model'

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

@Injectable()
export class OrderRepository {
  constructor(private readonly prismaService: PrismaService) {}

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

  async findAll(query: GetOrderListQueryType & { customerId?: number; currentHubId?: number }) {
    const { limit, page, status, customerId, currentHubId, search, trackingCode } = query
    const skip = (page - 1) * limit
    const take = limit

    const whereParams: any = {
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
        include: {
          items: true,
          ...paymentSummarySelect,
        },
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

  async update(id: number, payload: UpdateOrderStatusType) {
    return this.prismaService.order.update({
      where: {
        id,
      },
      data: payload,
      include: {
        items: true,
        ...paymentSummarySelect,
      },
    })
  }

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
