import { BadRequestException } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { TripCapacityService } from '../service/trip-capacity.service'

describe('TripCapacityService', () => {
  let service: TripCapacityService
  let prismaService: {
    order: { findMany: jest.Mock }
    tripStop: { findMany: jest.Mock }
    vehicle: { findFirst: jest.Mock }
  }

  beforeEach(() => {
    prismaService = {
      order: { findMany: jest.fn() },
      tripStop: { findMany: jest.fn() },
      vehicle: { findFirst: jest.fn() },
    }
    service = new TripCapacityService(prismaService as unknown as PrismaService)
  })

  it('cho phép khi tổng tải không vượt capacity', async () => {
    prismaService.vehicle.findFirst.mockResolvedValue({ capacityVolume: 10, capacityWeight: 100, id: 21 })
    prismaService.order.findMany.mockResolvedValue([
      { id: 1, totalVolume: 2, totalWeight: 20 },
      { id: 2, totalVolume: 3, totalWeight: 30 },
    ])
    prismaService.tripStop.findMany.mockResolvedValue([])

    const result = await service.assertVehicleCapacityForOrders({ orderIds: [1, 2], vehicleId: 21 })

    expect(result).toMatchObject({
      newVolume: 5,
      newWeight: 50,
      totalVolume: 5,
      totalWeight: 50,
      vehicleId: 21,
    })
  })

  it('chặn khi vượt trọng lượng', async () => {
    prismaService.vehicle.findFirst.mockResolvedValue({ capacityVolume: 10, capacityWeight: 40, id: 21 })
    prismaService.order.findMany.mockResolvedValue([{ id: 1, totalVolume: 2, totalWeight: 50 }])
    prismaService.tripStop.findMany.mockResolvedValue([])

    await expect(service.assertVehicleCapacityForOrders({ orderIds: [1], vehicleId: 21 })).rejects.toThrow(
      BadRequestException,
    )
  })

  it('chặn khi vượt thể tích', async () => {
    prismaService.vehicle.findFirst.mockResolvedValue({ capacityVolume: 4, capacityWeight: 100, id: 21 })
    prismaService.order.findMany.mockResolvedValue([{ id: 1, totalVolume: 5, totalWeight: 10 }])
    prismaService.tripStop.findMany.mockResolvedValue([])

    await expect(service.assertVehicleCapacityForOrders({ orderIds: [1], vehicleId: 21 })).rejects.toThrow(
      'Tổng thể tích mới',
    )
  })

  it('tính cả tải hiện có khi thêm đơn vào trip', async () => {
    prismaService.vehicle.findFirst.mockResolvedValue({ capacityVolume: 10, capacityWeight: 100, id: 21 })
    prismaService.order.findMany.mockResolvedValue([{ id: 3, totalVolume: 2, totalWeight: 25 }])
    prismaService.tripStop.findMany.mockResolvedValue([
      {
        orderId: 1,
        order: { status: 'ASSIGNED', totalVolume: 3, totalWeight: 35 },
      },
    ])

    const result = await service.assertVehicleCapacityForOrders({
      existingTripId: 88,
      orderIds: [3],
      vehicleId: 21,
    })

    expect(result).toMatchObject({
      existingVolume: 3,
      existingWeight: 35,
      totalVolume: 5,
      totalWeight: 60,
    })
  })

  it('chặn danh sách orderIds bị trùng', async () => {
    await expect(service.assertVehicleCapacityForOrders({ orderIds: [1, 1], vehicleId: 21 })).rejects.toThrow(
      'Danh sách đơn hàng không được chứa trùng lặp.',
    )
    expect(prismaService.vehicle.findFirst).not.toHaveBeenCalled()
  })

  it('kiểm tra tải hiện có khi đổi xe cho trip', async () => {
    prismaService.vehicle.findFirst.mockResolvedValue({ capacityVolume: 6, capacityWeight: 70, id: 22 })
    prismaService.tripStop.findMany.mockResolvedValue([
      {
        orderId: 1,
        order: { status: 'ASSIGNED', totalVolume: 2, totalWeight: 25 },
      },
      {
        orderId: 2,
        order: { status: 'ASSIGNED', totalVolume: 3, totalWeight: 35 },
      },
    ])

    const result = await service.assertVehicleCapacityForTrip({ tripId: 88, vehicleId: 22 })

    expect(result).toMatchObject({
      newVolume: 0,
      newWeight: 0,
      totalVolume: 5,
      totalWeight: 60,
    })
  })
})
