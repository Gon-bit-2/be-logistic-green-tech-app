import { BadRequestException } from '@nestjs/common'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { EVENT_SOURCE, TRACKING_EVENT_TYPE } from 'src/common/constants/tracking.constant'
import { PrismaService } from 'src/database/prisma.service'
import { CodSettlementService } from './cod-settlement.service'
import { NotificationEmitterService } from './notification-emitter.service'
import { OrderStateService } from './order-state.service'

describe('OrderStateService', () => {
  let service: OrderStateService
  let prismaService: { $transaction: jest.Mock }
  let tx: any
  let codSettlementService: { collectCodForOrder: jest.Mock }
  let notificationEmitter: { emitSafe: jest.Mock }

  beforeEach(() => {
    tx = {
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      orderTrackingEvent: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
      proofOfDelivery: {
        create: jest.fn(),
      },
    }
    prismaService = {
      $transaction: jest.fn((callback) => callback(tx)),
    }
    codSettlementService = {
      collectCodForOrder: jest.fn().mockResolvedValue({ success: true }),
    }
    notificationEmitter = {
      emitSafe: jest.fn().mockResolvedValue(undefined),
    }
    service = new OrderStateService(
      prismaService as unknown as PrismaService,
      codSettlementService as unknown as CodSettlementService,
      notificationEmitter as unknown as NotificationEmitterService,
    )
  })

  it('valid transition tạo tracking event và cập nhật order', async () => {
    tx.order.findFirst.mockResolvedValue({
      codAmount: 0,
      customerId: 7,
      id: 1,
      isCodCollected: false,
      payment: { amount: 10000, method: 'STRIPE', status: 'COMPLETED' },
      status: ORDER_STATUS.PENDING,
      trackingCode: 'ORD001',
    })
    tx.orderTrackingEvent.create.mockResolvedValue({ id: 10 })
    tx.order.update.mockResolvedValue({
      customerId: 7,
      id: 1,
      status: ORDER_STATUS.ASSIGNED,
      trackingCode: 'ORD001',
    })

    const result = await service.transitionOrderStatus({
      createdById: 9,
      orderId: 1,
      source: EVENT_SOURCE.ADMIN_PORTAL,
      status: ORDER_STATUS.ASSIGNED,
    })

    expect(result.event).toEqual({ id: 10 })
    expect(tx.orderTrackingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 9,
          eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE,
          orderId: 1,
          status: ORDER_STATUS.ASSIGNED,
        }),
      }),
    )
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ORDER_STATUS.ASSIGNED,
          updatedById: 9,
        }),
      }),
    )
  })

  it('invalid transition bị chặn', async () => {
    tx.order.findFirst.mockResolvedValue({
      id: 1,
      status: ORDER_STATUS.PENDING,
    })

    await expect(
      service.transitionOrderStatus({
        createdById: 9,
        orderId: 1,
        source: EVENT_SOURCE.ADMIN_PORTAL,
        status: ORDER_STATUS.DELIVERED,
      }),
    ).rejects.toThrow(BadRequestException)
    expect(tx.orderTrackingEvent.create).not.toHaveBeenCalled()
  })

  it('terminal state không chuyển tiếp', async () => {
    tx.order.findFirst.mockResolvedValue({
      id: 1,
      status: ORDER_STATUS.DELIVERED,
    })

    await expect(
      service.transitionOrderStatus({
        createdById: 9,
        orderId: 1,
        source: EVENT_SOURCE.ADMIN_PORTAL,
        status: ORDER_STATUS.CANCELLED,
      }),
    ).rejects.toThrow('trạng thái cuối')
  })

  it('system transition ghi event với createdById null', async () => {
    tx.order.findMany.mockResolvedValue([{ customerId: 1, id: 2, status: ORDER_STATUS.ASSIGNED, trackingCode: 'O2' }])
    tx.order.updateMany.mockResolvedValue({ count: 1 })
    tx.orderTrackingEvent.createMany.mockResolvedValue({ count: 1 })

    await service.transitionOrdersInTransaction({
      orderIds: [2],
      source: EVENT_SOURCE.SYSTEM,
      status: ORDER_STATUS.PENDING,
      tx,
      validationMode: 'system',
    })

    expect(tx.orderTrackingEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            createdById: null,
            orderId: 2,
            status: ORDER_STATUS.PENDING,
          }),
        ],
      }),
    )
  })

  it('delivered COD gọi CodSettlementService', async () => {
    tx.order.findFirst.mockResolvedValue({
      codAmount: 42500,
      customerId: 7,
      id: 4,
      isCodCollected: false,
      payment: { amount: 42500, method: 'COD', status: 'PENDING' },
      status: ORDER_STATUS.OUT_FOR_DELIVERY,
      trackingCode: 'ORD004',
    })
    tx.orderTrackingEvent.create.mockResolvedValue({ id: 12 })
    tx.order.update.mockResolvedValue({
      customerId: 7,
      id: 4,
      status: ORDER_STATUS.DELIVERED,
      trackingCode: 'ORD004',
    })

    await service.transitionOrderStatus({
      codCollection: { amount: 42500, driverId: 22, orderReference: 'ORD004' },
      createdById: 22,
      orderId: 4,
      pod: {
        images: [{ type: 'PACKAGE', url: 'https://example.com/pod.png' }],
        packageCondition: 'INTACT',
        receiverName: 'Minh',
      },
      source: EVENT_SOURCE.DRIVER_APP,
      status: ORDER_STATUS.DELIVERED,
    })

    expect(codSettlementService.collectCodForOrder).toHaveBeenCalledWith(
      4,
      22,
      expect.objectContaining({
        amount: 42500,
        orderReference: 'ORD004',
        tx,
      }),
    )
  })

  it('delivered bắt buộc phải có POD', async () => {
    tx.order.findFirst.mockResolvedValue({
      id: 4,
      payment: { method: 'STRIPE', status: 'COMPLETED' },
      status: ORDER_STATUS.OUT_FOR_DELIVERY,
    })

    await expect(
      service.transitionOrderStatus({
        createdById: 22,
        orderId: 4,
        source: EVENT_SOURCE.DRIVER_APP,
        status: ORDER_STATUS.DELIVERED,
      }),
    ).rejects.toThrow('Proof of Delivery')
  })
})
