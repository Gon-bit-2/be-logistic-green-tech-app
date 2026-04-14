import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { CreateOrderBodyType, GetOrderListQueryType, UpdateOrderStatusType } from 'src/modules/orders/model/order.model'

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
    },
  ) {
    const { items, ...restPayload } = payload

    return this.prismaService.order.create({
      data: {
        ...restPayload,
        ...calculatedData,
        createdById,
        customerId,
        items: {
          create: items,
        },
      },
      include: {
        items: true,
      },
    })
  }

  async findAll(query: GetOrderListQueryType) {
    const { limit, page, status } = query
    const skip = (page - 1) * limit
    const take = limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.order.count({
        where: {
          deletedAt: null,
          status,
        },
      }),
      this.prismaService.order.findMany({
        where: {
          deletedAt: null,
          status,
        },
        include: {
          items: true,
        },
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
      },
    })
  }

  async update(id: number, payload: UpdateOrderStatusType) {
    return this.prismaService.order.update({
      where: {
        id,
      },
      data: payload,
    })
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }, isHard?: boolean) {
    if (isHard) {
      return this.prismaService.order.delete({
        where: {
          id,
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
    })
  }
}
