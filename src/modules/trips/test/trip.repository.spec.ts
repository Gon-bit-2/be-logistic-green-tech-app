import { BadRequestException } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { TripRepository } from '../repository/trip.repository'
import { OrderStateService } from 'src/common/services/order-state.service'

describe('TripRepository', () => {
  let repository: TripRepository
  let tx: any
  let prismaService: { $transaction: jest.Mock }
  let orderStateService: { transitionOrdersInTransaction: jest.Mock; transitionOrderStatus: jest.Mock }

  beforeEach(() => {
    tx = {
      driverAssignmentRequest: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      order: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      trip: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    prismaService = {
      $transaction: jest.fn((callback) => callback(tx)),
    }
    orderStateService = {
      transitionOrdersInTransaction: jest.fn().mockResolvedValue({ count: 1 }),
      transitionOrderStatus: jest.fn().mockResolvedValue({ event: { id: 1 } }),
    }
    repository = new TripRepository(
      prismaService as unknown as PrismaService,
      orderStateService as unknown as OrderStateService,
    )
  })

  it('strict mặc định: không tạo trip một phần nếu thiếu order khả dụng', async () => {
    tx.order.findMany.mockResolvedValue([{ id: 1 }])

    await expect(
      repository.createTripWithStops(
        21,
        12,
        [1, 2],
        [
          { hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' },
          { hubId: null, orderId: 2, stopSequence: 2, stopType: 'DROPOFF' },
        ],
      ),
    ).rejects.toThrow(BadRequestException)

    expect(tx.trip.create).not.toHaveBeenCalled()
  })

  it('allowPartial: tạo trip với phần order còn khả dụng và lọc stops stale', async () => {
    tx.order.findMany.mockResolvedValue([{ id: 1 }])
    tx.trip.create.mockResolvedValue({ id: 88, stops: [] })
    tx.order.updateMany.mockResolvedValue({ count: 1 })

    const result = await repository.createTripWithStops(
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
    expect(tx.trip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stops: {
            create: [{ hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' }],
          },
        }),
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
    tx.trip.findFirst.mockResolvedValueOnce({ id: 77 }).mockResolvedValueOnce(null)

    await expect(
      repository.createTripWithStops(21, 12, [1], [
        { hubId: null, orderId: 1, stopSequence: 1, stopType: 'DROPOFF' },
      ]),
    ).rejects.toThrow('Xe #21 đang bận ở chuyến #77')

    expect(tx.order.findMany).not.toHaveBeenCalled()
  })
})
