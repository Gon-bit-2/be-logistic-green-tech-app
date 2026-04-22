import { OrderRepository } from '../repository/order.repo'
import { PrismaService } from 'src/database/prisma.service'

describe('OrderRepository', () => {
  let repository: OrderRepository
  let prismaService: {
    order: {
      count: jest.Mock
      findMany: jest.Mock
      findFirst: jest.Mock
      update: jest.Mock
      create: jest.Mock
      delete: jest.Mock
    }
  }

  beforeEach(() => {
    prismaService = {
      order: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    }

    repository = new OrderRepository(prismaService as unknown as PrismaService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('findAll áp dụng search, orderBy createdAt desc và include payment summary', async () => {
    await repository.findAll({
      page: 2,
      limit: 5,
      search: 'linh',
      customerId: 7,
    } as any)

    expect(prismaService.order.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        customerId: 7,
        OR: [
          { trackingCode: { contains: 'linh', mode: 'insensitive' } },
          { senderName: { contains: 'linh', mode: 'insensitive' } },
          { receiverName: { contains: 'linh', mode: 'insensitive' } },
          { senderAddress: { contains: 'linh', mode: 'insensitive' } },
          { receiverAddress: { contains: 'linh', mode: 'insensitive' } },
        ],
      },
      include: {
        items: true,
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
      },
      orderBy: { createdAt: 'desc' },
      skip: 5,
      take: 5,
    })
  })

  it('findById include payment summary cho customer detail', async () => {
    await repository.findById(12)

    expect(prismaService.order.findFirst).toHaveBeenCalledWith({
      where: {
        id: 12,
        deletedAt: null,
      },
      include: {
        items: true,
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
      },
    })
  })
})
