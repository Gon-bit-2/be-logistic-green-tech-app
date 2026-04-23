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

  it('findAll ưu tiên trackingCode exact-match thay cho search mơ hồ', async () => {
    await repository.findAll({
      page: 1,
      limit: 2,
      trackingCode: 'GT-ORD-20260003',
      search: 'ignored-search',
      currentHubId: 5,
    } as any)

    expect(prismaService.order.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        currentHubId: 5,
        trackingCode: {
          equals: 'GT-ORD-20260003',
          mode: 'insensitive',
        },
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
      skip: 0,
      take: 2,
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

  it('create khởi tạo payment placeholder STRIPE ngay khi tạo đơn', async () => {
    prismaService.order.create.mockResolvedValue({ id: 21 } as any)

    await repository.create(
      5,
      7,
      {
        paymentMethod: 'STRIPE',
        receiverAddress: 'Receiver',
        receiverLat: 10.2,
        receiverLng: 106.2,
        receiverName: 'Receiver',
        receiverPhone: '0911111111',
        senderAddress: 'Sender',
        senderLat: 10.1,
        senderLng: 106.1,
        senderName: 'Sender',
        senderPhone: '0900000000',
        items: [{ name: 'Box', quantity: 1, weight: 2 }],
        serviceType: 'STANDARD',
      } as any,
      {
        totalWeight: 2,
        totalVolume: 0.1,
        shippingFee: 42500,
        estimatedCo2Saved: 0.0625,
        currentHubId: 3,
        paymentMethod: 'STRIPE',
      },
    )

    expect(prismaService.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        codAmount: 0,
        payment: {
          create: {
            amount: 42500,
            method: 'STRIPE',
            status: 'PENDING',
            createdById: 5,
          },
        },
      }),
      include: expect.any(Object),
    })
  })

  it('create khởi tạo payment placeholder COD và codAmount theo shippingFee', async () => {
    prismaService.order.create.mockResolvedValue({ id: 22 } as any)

    await repository.create(
      5,
      7,
      {
        paymentMethod: 'COD',
        receiverAddress: 'Receiver',
        receiverLat: 10.2,
        receiverLng: 106.2,
        receiverName: 'Receiver',
        receiverPhone: '0911111111',
        senderAddress: 'Sender',
        senderLat: 10.1,
        senderLng: 106.1,
        senderName: 'Sender',
        senderPhone: '0900000000',
        items: [{ name: 'Box', quantity: 1, weight: 2 }],
        serviceType: 'STANDARD',
      } as any,
      {
        totalWeight: 2,
        totalVolume: 0.1,
        shippingFee: 42500,
        estimatedCo2Saved: 0.0625,
        currentHubId: 3,
        paymentMethod: 'COD',
      },
    )

    expect(prismaService.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        codAmount: 42500,
        payment: {
          create: {
            amount: 42500,
            method: 'COD',
            status: 'PENDING',
            createdById: 5,
          },
        },
      }),
      include: expect.any(Object),
    })
  })
})
