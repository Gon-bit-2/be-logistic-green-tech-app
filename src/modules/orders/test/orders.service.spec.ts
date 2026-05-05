// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing'
import { OrdersService } from '../service/orders.service'
import { OrderRepository } from '../repository/order.repo'
import { PrismaService } from 'src/database/prisma.service'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { NotificationEmitterService } from 'src/common/services/notification-emitter.service'
import { NotificationEventName } from 'src/modules/notification/events/notification.event'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { MapsService } from 'src/modules/maps/service/maps.service'
import { TrackingRepository } from 'src/modules/tracking/repository/tracking.repo'
import { OrderStateService } from 'src/common/services/order-state.service'

// Mock calculateHaversineDistance before testing
jest.mock('src/common/utils/geo.util', () => ({
  calculateHaversineDistance: jest.fn(),
}))
import { calculateHaversineDistance } from 'src/common/utils/geo.util'

describe('OrdersService', () => {
  let service: OrdersService
  let orderRepo: jest.Mocked<OrderRepository>
  let prismaService: any // Mucking Prisma is easier by object assignment
  let notificationEmitter: jest.Mocked<NotificationEmitterService>
  let trackingRepo: jest.Mocked<TrackingRepository>
  let orderStateService: jest.Mocked<OrderStateService>

  beforeEach(async () => {
    const orderRepoMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }

    const prismaServiceMock = {
      hub: {
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    }

    const notificationEmitterMock = {
      emitSafe: jest.fn().mockResolvedValue(undefined),
    }

    const trackingRepoMock = {
      createEventWithStatusUpdate: jest.fn(),
    }
    const orderStateServiceMock = {
      transitionOrderStatus: jest.fn().mockResolvedValue({ event: { id: 1 }, order: { id: 1 } }),
    }

    const mapsServiceMock = {
      directions: jest.fn().mockResolvedValue({
        distanceMeters: 5200,
        durationSeconds: 1200,
        polyline: 'encoded_polyline',
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: OrderRepository,
          useValue: orderRepoMock,
        },
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
        {
          provide: NotificationEmitterService,
          useValue: notificationEmitterMock,
        },
        {
          provide: MapsService,
          useValue: mapsServiceMock,
        },
        {
          provide: TrackingRepository,
          useValue: trackingRepoMock,
        },
        {
          provide: OrderStateService,
          useValue: orderStateServiceMock,
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile()

    service = module.get<OrdersService>(OrdersService)
    orderRepo = module.get(OrderRepository)
    prismaService = module.get(PrismaService)
    notificationEmitter = module.get(NotificationEmitterService)
    trackingRepo = module.get(TrackingRepository)
    orderStateService = module.get(OrderStateService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('Tính toán phí giao < 10km, gán hub gần nhất thành công (geo-fencing)', async () => {
      // Giả lập Hub active
      prismaService.hub.findMany.mockResolvedValue([{ id: 1, latitude: 10.1, longitude: 106.1, name: 'Hub 1' }])
      // Giả lập khoảng cách
      ;(calculateHaversineDistance as jest.Mock).mockReturnValue(5) // 5km
      // Giả lập response từ repo
      orderRepo.create.mockResolvedValue({ id: 100, customerId: 2, trackingCode: 'ORD100' } as any)

      const payload = {
        receiverName: 'A',
        receiverPhone: '123',
        senderAddress: 'S',
        receiverAddress: 'R',
        senderLat: 10.0,
        senderLng: 106.0,
        receiverLat: 10.05,
        receiverLng: 106.05,
        items: [
          { name: 'item 1', weight: 1, quantity: 2, length: 10, width: 10, height: 10 }, // weight = 2kg
          { name: 'item 2', weight: 3, quantity: 1 }, // weight = 3kg
        ],
      } // Tổng weight = 5kg

      const result = await service.create(1, 2, payload as any)

      expect(result).toEqual({ order: { id: 100, customerId: 2, trackingCode: 'ORD100' } })
      expect(prismaService.hub.findMany).toHaveBeenCalled()

      // Kiểm tra giá trị truyền vào repo.create: totalWeight = 5, distanceKm = 5, heavyFee = 0 => base(15000) + 5*5500(27500) = 42500
      expect(orderRepo.create).toHaveBeenCalledWith(
        1,
        2,
        payload,
        expect.objectContaining({
          totalWeight: 5,
          totalVolume: 0.002,
          currentHubId: 1,
          shippingFee: 42500, // 15000 + 5*5500
          estimatedCo2Saved: 5 * 0.0125, // 0.0625
        }),
      )
      expect(notificationEmitter.emitSafe).toHaveBeenCalledWith(NotificationEventName.ORDER_CREATED, {
        userId: 2,
        orderId: 100,
        trackingCode: 'ORD100',
      })
    })

    it('Tính toán phí giao > 10km và Phụ phí hàng nặng (Heavy Fee > 5kg) và Gán đơn mồ côi (khi ko có Hub)', async () => {
      prismaService.hub.findMany.mockResolvedValue([]) // Không có Hub hoạt động -> mồ côi
      ;(calculateHaversineDistance as jest.Mock).mockReturnValue(15) // 15km
      orderRepo.create.mockResolvedValue({ id: 101, customerId: 2, trackingCode: 'ORD101' } as any)

      const payload = {
        senderLat: 10.0,
        senderLng: 106.0,
        receiverLat: 10.15,
        receiverLng: 106.15,
        items: [
          { name: 'item', weight: 4, quantity: 2 }, // Total weight = 8kg
        ],
      }

      await service.create(1, 2, payload as any)

      // Phí: distance > 10km => (10 * 5500) + (5 * 4000) = 55000 + 20000 = 75000
      // Base: 15000
      // Heavy fee: weight = 8kg => vượt 3kg => Math.ceil(8-5)*2000 = 6000
      // Total = 15000 + 75000 + 6000 = 96000
      expect(orderRepo.create).toHaveBeenCalledWith(
        1,
        2,
        payload,
        expect.objectContaining({
          totalWeight: 8,
          currentHubId: null, // Đơn mồ côi
          shippingFee: 96000,
        }),
      )
      expect(notificationEmitter.emitSafe).toHaveBeenCalledWith(NotificationEventName.ORDER_CREATED, {
        userId: 2,
        orderId: 101,
        trackingCode: 'ORD101',
      })
    })

    it('làm tròn shipping fee về VND nguyên khi khoảng cách tạo ra số lẻ', async () => {
      prismaService.hub.findMany.mockResolvedValue([{ id: 1, latitude: 10.1, longitude: 106.1, name: 'Hub 1' }])
      ;(calculateHaversineDistance as jest.Mock).mockReturnValue(2.0163272727)
      orderRepo.create.mockResolvedValue({ id: 102, customerId: 2, trackingCode: 'ORD102' } as any)

      const payload = {
        senderLat: 10.0,
        senderLng: 106.0,
        receiverLat: 10.02,
        receiverLng: 106.02,
        items: [{ name: 'item', weight: 1, quantity: 1 }],
      }

      await service.create(1, 2, payload as any)

      expect(orderRepo.create).toHaveBeenCalledWith(
        1,
        2,
        payload,
        expect.objectContaining({
          shippingFee: 26090,
        }),
      )
    })
  })

  describe('findAll', () => {
    it('gọi hàm findAll của repo', async () => {
      orderRepo.findAll.mockResolvedValue({ data: [], totalItems: 0 } as any)
      const res = await service.findAll({})
      expect(res).toEqual({ data: [], totalItems: 0 })
      expect(orderRepo.findAll).toHaveBeenCalledWith({})
    })

    it('forward search filter để repo xử lý sorting và payment summary', async () => {
      orderRepo.findAll.mockResolvedValue({ data: [], totalItems: 0 } as any)

      await service.findAll({ search: 'ORD-2026', page: 1, limit: 10 } as any)

      expect(orderRepo.findAll).toHaveBeenCalledWith({
        search: 'ORD-2026',
        page: 1,
        limit: 10,
      })
    })

    it('inject currentHubId khi actor là warehouse staff', async () => {
      prismaService.user.findFirst.mockResolvedValue({ hubId: 8 })
      orderRepo.findAll.mockResolvedValue({ data: [], totalItems: 0 } as any)

      await service.findAll(
        { trackingCode: 'GT-ORD-20260003', page: 1, limit: 10 } as any,
        { userId: 99, roleName: 'WAREHOUSE_STAFF' } as any,
      )

      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 99,
          deletedAt: null,
          isDeleted: false,
        },
        select: {
          hubId: true,
        },
      })
      expect(orderRepo.findAll).toHaveBeenCalledWith({
        trackingCode: 'GT-ORD-20260003',
        page: 1,
        limit: 10,
        currentHubId: 8,
      })
    })
  })

  describe('findById', () => {
    it('trả ra đối tượng nếu ID tồn tại', async () => {
      orderRepo.findById.mockResolvedValue({ id: 1 } as any)
      const res = await service.findById(1)
      expect(res).toEqual({ id: 1 })
      expect(orderRepo.findById).toHaveBeenCalledWith(1)
    })
  })

  describe('update, cancel & delete', () => {
    it('cập nhật trạng thái qua OrderStateService', async () => {
      orderRepo.findById.mockResolvedValue({
        id: 1,
        customerId: 7,
        trackingCode: 'ORD001',
        status: ORDER_STATUS.ASSIGNED,
      } as any)
      const payload: any = { status: ORDER_STATUS.ASSIGNED }
      const res = await service.update(1, payload, { userId: 9, roleName: 'ADMIN' } as any)
      expect(res).toEqual({ id: 1, customerId: 7, trackingCode: 'ORD001', status: ORDER_STATUS.ASSIGNED })
      expect(orderStateService.transitionOrderStatus).toHaveBeenCalledWith(expect.objectContaining({
        createdById: 9,
        orderId: 1,
        source: 'ADMIN_PORTAL',
        status: ORDER_STATUS.ASSIGNED,
      }))
    })

    it('không bắn notification cho status không nằm trong danh sách notify', async () => {
      orderRepo.findById.mockResolvedValue({
        id: 2,
        customerId: 7,
        trackingCode: 'ORD002',
        status: ORDER_STATUS.ASSIGNED,
      } as any)

      await service.update(2, { status: ORDER_STATUS.ASSIGNED } as any)

      expect(orderStateService.transitionOrderStatus).toHaveBeenCalled()
      expect(notificationEmitter.emitSafe).not.toHaveBeenCalled()
    })

    it('hủy đơn thành công khi customer là owner và status = PENDING', async () => {
      orderRepo.findById
        .mockResolvedValueOnce({
          id: 10,
          customerId: 7,
          trackingCode: 'ORD010',
          status: ORDER_STATUS.PENDING,
        } as any)
        .mockResolvedValueOnce({
          id: 10,
          customerId: 7,
          trackingCode: 'ORD010',
          status: ORDER_STATUS.CANCELLED,
        } as any)

      const result = await service.cancel(10, { userId: 7, roleName: 'CUSTOMER' } as any)

      expect(orderStateService.transitionOrderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 10,
          status: ORDER_STATUS.CANCELLED,
          source: 'CUSTOMER_APP',
        }),
      )
      expect(result).toEqual({
        id: 10,
        customerId: 7,
        trackingCode: 'ORD010',
        status: ORDER_STATUS.CANCELLED,
      })
    })

    it('hủy đơn thành công khi status = ASSIGNED', async () => {
      orderRepo.findById
        .mockResolvedValueOnce({
          id: 11,
          customerId: 8,
          trackingCode: 'ORD011',
          status: ORDER_STATUS.ASSIGNED,
        } as any)
        .mockResolvedValueOnce({
          id: 11,
          customerId: 8,
          trackingCode: 'ORD011',
          status: ORDER_STATUS.CANCELLED,
        } as any)

      await service.cancel(11, { userId: 8, roleName: 'CUSTOMER' } as any)

      expect(orderStateService.transitionOrderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 11,
          status: ORDER_STATUS.CANCELLED,
        }),
      )
    })

    it.each([ORDER_STATUS.PICKED_UP, ORDER_STATUS.IN_TRANSIT, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED])(
      'từ chối hủy khi status = %s',
      async (status) => {
        orderRepo.findById.mockResolvedValue({
          id: 12,
          customerId: 7,
          trackingCode: 'ORD012',
          status,
        } as any)

        await expect(service.cancel(12, { userId: 7, roleName: 'CUSTOMER' } as any)).rejects.toThrow(
          'Đơn hàng chỉ có thể hủy khi đang chờ xử lý hoặc đã phân công.',
        )

        expect(orderStateService.transitionOrderStatus).not.toHaveBeenCalled()
      },
    )

    it('hủy đơn thành công khi warehouse staff thao tác trên đơn thuộc hub của mình', async () => {
      orderRepo.findById
        .mockResolvedValueOnce({
          id: 13,
          customerId: 15,
          currentHubId: 8,
          trackingCode: 'ORD013',
          status: ORDER_STATUS.PENDING,
        } as any)
        .mockResolvedValueOnce({
          id: 13,
          customerId: 15,
          currentHubId: 8,
          trackingCode: 'ORD013',
          status: ORDER_STATUS.CANCELLED,
        } as any)
      prismaService.user.findFirst.mockResolvedValue({ hubId: 8 })

      const result = await service.cancel(13, { userId: 22, roleName: 'WAREHOUSE_STAFF' } as any)

      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 22,
          deletedAt: null,
          isDeleted: false,
        },
        select: {
          hubId: true,
        },
      })
      expect(orderStateService.transitionOrderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          createdById: 22,
          orderId: 13,
          status: ORDER_STATUS.CANCELLED,
          source: 'HUB_SCANNER',
          description: 'Nhân viên kho đã hủy đơn hàng.',
        }),
      )
      expect(result).toEqual({
        id: 13,
        customerId: 15,
        currentHubId: 8,
        trackingCode: 'ORD013',
        status: ORDER_STATUS.CANCELLED,
      })
    })

    it('từ chối warehouse staff hủy đơn ngoài hub của mình', async () => {
      orderRepo.findById.mockResolvedValue({
        id: 14,
        customerId: 15,
        currentHubId: 9,
        trackingCode: 'ORD014',
        status: ORDER_STATUS.PENDING,
      } as any)
      prismaService.user.findFirst.mockResolvedValue({ hubId: 8 })

      await expect(service.cancel(14, { userId: 22, roleName: 'WAREHOUSE_STAFF' } as any)).rejects.toThrow(
        'Nhân viên kho chỉ được hủy đơn thuộc kho của mình.',
      )

      expect(orderStateService.transitionOrderStatus).not.toHaveBeenCalled()
    })

    it('cho phép admin hủy đơn và ghi audit với nguồn admin portal', async () => {
      orderRepo.findById
        .mockResolvedValueOnce({
          id: 15,
          customerId: 31,
          trackingCode: 'ORD015',
          status: ORDER_STATUS.ASSIGNED,
        } as any)
        .mockResolvedValueOnce({
          id: 15,
          customerId: 31,
          trackingCode: 'ORD015',
          status: ORDER_STATUS.CANCELLED,
        } as any)

      const result = await service.cancel(15, { userId: 1, roleName: 'ADMIN' } as any)

      expect(prismaService.user.findFirst).not.toHaveBeenCalled()
      expect(orderStateService.transitionOrderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          createdById: 1,
          orderId: 15,
          status: ORDER_STATUS.CANCELLED,
          source: 'ADMIN_PORTAL',
          description: 'Quản trị viên đã hủy đơn hàng.',
        }),
      )
      expect(result).toEqual({
        id: 15,
        customerId: 31,
        trackingCode: 'ORD015',
        status: ORDER_STATUS.CANCELLED,
      })
    })

    it('gọi hàm delete của repo', async () => {
      orderRepo.delete.mockResolvedValue({ id: 1 } as any)
      const res = await service.delete(1, 2)
      expect(res).toEqual({ id: 1 })
      expect(orderRepo.delete).toHaveBeenCalledWith({ id: 1, deletedById: 2 })
    })
  })
})
