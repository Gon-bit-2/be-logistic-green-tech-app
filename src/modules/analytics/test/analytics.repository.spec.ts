import { PrismaService } from 'src/database/prisma.service'
import { AnalyticsRepository } from '../repository/analytics.repo'

describe('AnalyticsRepository', () => {
  let repository: AnalyticsRepository
  let prismaService: {
    $queryRaw: jest.Mock
    order: {
      aggregate: jest.Mock
      count: jest.Mock
    }
    trip: {
      aggregate: jest.Mock
    }
    tripEmissionLog: {
      aggregate: jest.Mock
    }
  }

  beforeEach(() => {
    prismaService = {
      $queryRaw: jest.fn(),
      order: {
        aggregate: jest.fn(),
        count: jest.fn(),
      },
      trip: {
        aggregate: jest.fn(),
      },
      tripEmissionLog: {
        aggregate: jest.fn(),
      },
    }
    repository = new AnalyticsRepository(prismaService as unknown as PrismaService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('dashboard summary dùng delivery metrics thật thay vì hardcode', async () => {
    prismaService.order.count.mockResolvedValue(5)
    prismaService.order.aggregate.mockResolvedValue({ _sum: { shippingFee: 125000 } })
    prismaService.trip.aggregate.mockResolvedValue({ _sum: { totalDistance: 42.75 } })
    prismaService.tripEmissionLog.aggregate.mockResolvedValue({ _sum: { co2Saved: 12.345 } })
    prismaService.$queryRaw.mockResolvedValue([{ avgDeliveryTime: 3.456, onTimeDeliveryRate: 66.666 }])

    const result = await repository.getDashboardSummary({ dateRange: '30d' })

    expect(result).toEqual({
      avgDeliveryTime: 3.46,
      onTimeDeliveryRate: 66.67,
      totalCo2Saved: 12.345,
      totalDistance: 42.75,
      totalOrders: 5,
      totalRevenue: 125000,
    })
    expect(prismaService.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('orders analytics trả avgDeliveryTime từ query thật, không dùng random', async () => {
    prismaService.$queryRaw.mockResolvedValue([
      {
        avgDeliveryTime: 2.25,
        count: 2,
        revenue: 75000,
        truncDate: new Date('2026-05-04T00:00:00.000Z'),
      },
    ])

    const result = await repository.getOrdersAnalytics({ dateRange: '7d' })

    expect(result).toEqual([
      {
        avgDeliveryTime: 2.25,
        count: 2,
        period: 'Mon',
        revenue: 75000,
      },
    ])
  })

  it('fleet performance tính efficiency từ orderCount/totalDistance, không dùng random', async () => {
    prismaService.$queryRaw.mockResolvedValue([
      {
        co2Saved: 8,
        licensePlate: '51A-88888',
        orderCount: 5,
        totalDistance: 20,
        totalTrips: 2,
        vehicleId: '21',
      },
    ])

    const result = await repository.getFleetPerformance({ dateRange: '30d' })

    expect(result).toEqual([
      {
        co2Saved: 8,
        efficiency: 0.25,
        licensePlate: '51A-88888',
        orderCount: 5,
        totalDistance: 20,
        totalTrips: 2,
        vehicleId: 'v21',
      },
    ])
  })
})
