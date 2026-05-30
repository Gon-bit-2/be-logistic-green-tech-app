import { BadRequestException } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { OrderStateService } from 'src/common/services/order-state.service'
import { TripWriteRepository } from '../repository/trip-write.repository'
import { TripCreationService } from '../service/trip-creation.service'

describe('TripCreationService', () => {
  let service: TripCreationService
  let tx: any
  let prismaService: { $transaction: jest.Mock }
  let tripWriteRepository: jest.Mocked<TripWriteRepository>
  let orderStateService: { transitionOrdersInTransaction: jest.Mock }

  beforeEach(() => {
    tx = {}
    prismaService = {
      $transaction: jest.fn((callback) => callback(tx)),
    }
    tripWriteRepository = {
      approveAssignmentRequest: jest.fn(),
      cancelPendingAssignmentRequests: jest.fn().mockResolvedValue({ count: 0 }),
      createTripRecord: jest.fn(),
      findActiveTripByDriver: jest.fn().mockResolvedValue(null),
      findActiveTripByVehicle: jest.fn().mockResolvedValue(null),
      findDispatchableOrderIds: jest.fn(),
    } as unknown as jest.Mocked<TripWriteRepository>
    orderStateService = {
      transitionOrdersInTransaction: jest.fn().mockResolvedValue({ count: 1 }),
    }
    service = new TripCreationService(
      prismaService as unknown as PrismaService,
      tripWriteRepository,
      orderStateService as unknown as OrderStateService,
    )
  })

  it('strict mặc định: không tạo trip một phần nếu thiếu order khả dụng', async () => {
    tripWriteRepository.findDispatchableOrderIds.mockResolvedValue([1])

    await expect(
      service.createTripWithStops(
        21,
        12,
        [1, 2],
        [
          { hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' },
          { hubId: null, orderId: 2, stopSequence: 2, stopType: 'DROPOFF' },
        ],
      ),
    ).rejects.toThrow(BadRequestException)

    expect(tripWriteRepository.createTripRecord).not.toHaveBeenCalled()
  })

  it('allowPartial: tạo trip với phần order còn khả dụng và lọc stops stale', async () => {
    tripWriteRepository.findDispatchableOrderIds.mockResolvedValue([1])
    tripWriteRepository.createTripRecord.mockResolvedValue({ id: 88, stops: [] } as any)

    const result = await service.createTripWithStops(
      21,
      12,
      [1, 2],
      [
        { hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' },
        { hubId: null, orderId: 2, stopSequence: 2, stopType: 'DROPOFF' },
      ],
      undefined,
      { allowPartial: true },
    )

    expect(result).toEqual({ id: 88, stops: [] })
    expect(tripWriteRepository.createTripRecord).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        stopsData: [{ hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' }],
      }),
    )
    expect(orderStateService.transitionOrdersInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        nextOrderData: { currentTripId: 88 },
        orderIds: [1],
        status: 'ASSIGNED',
      }),
    )
  })

  it('chặn tạo trip nếu vehicle đã có trip active trong transaction', async () => {
    tripWriteRepository.findActiveTripByVehicle.mockResolvedValue({ id: 77 } as any)

    await expect(
      service.createTripWithStops(21, 12, [1], [
        { hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' },
      ]),
    ).rejects.toThrow('Xe #21 đang bận ở chuyến #77')

    expect(tripWriteRepository.findDispatchableOrderIds).not.toHaveBeenCalled()
  })
})

describe('TripWriteRepository', () => {
  it('createTripRecord maps trip and nested stops to Prisma create', async () => {
    const prismaService = { trip: { update: jest.fn() } } as unknown as PrismaService
    const repository = new TripWriteRepository(prismaService)
    const tx = {
      trip: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    }

    await repository.createTripRecord(tx as any, {
      driverId: 12,
      stopsData: [{ hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' }],
      totalDistance: 42,
      vehicleId: 21,
    })

    expect(tx.trip.create).toHaveBeenCalledWith({
      data: {
        driverId: 12,
        status: 'PENDING',
        stops: {
          create: [{ hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' }],
        },
        totalDistance: 42,
        vehicleId: 21,
      },
      include: {
        stops: true,
      },
    })
  })
})
