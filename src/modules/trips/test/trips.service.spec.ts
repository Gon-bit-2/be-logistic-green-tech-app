// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing'
import { TripsService } from '../service/trips.service'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import { GamificationService } from '../../green-tech/service/gamification.service'
import { getQueueToken } from '@nestjs/bullmq'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { NotFoundException } from '@nestjs/common'
import { Queue } from 'bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { TrackingRepository } from 'src/modules/tracking/repository/tracking.repo'
import { NotificationEmitterService } from 'src/common/services/notification-emitter.service'
import { DispatchService } from '../service/dispatch.service'
import { DispatchBoardService } from '../service/dispatch-board.service'
import { DriverAssignmentService } from '../service/driver-assignment.service'
import { TripExecutionService } from '../service/trip-execution.service'
import { TripHubHelper } from '../service/trip-hub.helper'
import { DriverAssignmentHelper } from '../service/driver-assignment.helper'

describe('TripsService', () => {
  let service: TripsService
  let tripRepo: jest.Mocked<TripRepository>
  let prismaService: any
  let queueMock: jest.Mocked<Queue>
  let gamificationServiceMock: any

  beforeEach(async () => {
    const stripRepoMock = {
      findAll: jest.fn(),
      findById: jest.fn(),
      updateTripStatus: jest.fn(),
      findAvailableVehicles: jest.fn(),
      findPendingOrders: jest.fn(),
      findAvailableDrivers: jest.fn(),
      createTripWithStops: jest.fn(),
    }

    const prismaServiceMock = {
      hub: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      trip: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      driverAssignmentRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    }

    const queueFactoryMock = {
      add: jest.fn(),
      addBulk: jest.fn(),
    }

    const eventEmitterMock = {
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue(undefined),
    }
    const notificationEmitterMock = {
      emitSafe: jest.fn().mockResolvedValue(undefined),
    }

    gamificationServiceMock = {
      processTripEmission: jest.fn().mockResolvedValue(undefined),
    }
    const trackingRepoMock = {
      createEventWithStatusUpdate: jest.fn().mockResolvedValue({ id: 1 }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        DispatchService,
        DispatchBoardService,
        DriverAssignmentService,
        TripExecutionService,
        TripHubHelper,
        DriverAssignmentHelper,
        {
          provide: TripRepository,
          useValue: stripRepoMock,
        },
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
        {
          provide: GamificationService,
          useValue: gamificationServiceMock,
        },
        {
          provide: getQueueToken(AUTO_DISPATCH_QUEUE_NAME),
          useValue: queueFactoryMock,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitterMock,
        },
        {
          provide: NotificationEmitterService,
          useValue: notificationEmitterMock,
        },
        {
          provide: TrackingRepository,
          useValue: trackingRepoMock,
        },
      ],
    }).compile()

    service = module.get<TripsService>(TripsService)
    tripRepo = module.get(TripRepository)
    prismaService = module.get(PrismaService)
    queueMock = module.get(getQueueToken(AUTO_DISPATCH_QUEUE_NAME))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('autoDispatchLocalTask', () => {
    it('đưa yêu cầu gom chuyến riêng cho 1 hub vào queue', async () => {
      queueMock.add.mockResolvedValue({ id: 'job-1' } as any)

      const res = await service.autoDispatchLocalTask(5)
      expect(res).toEqual({
        message: 'Đã đưa yêu cầu gom chuyến cho Hub 5 vào hàng đợi xử lý ngầm.',
        jobId: 'job-1',
      })
      expect(queueMock.add).toHaveBeenCalledWith('dispatch-local', { hubId: 5 }, { jobId: 'dispatch-hub-5' })
    })
  })

  describe('autoDispatchGlobalTask', () => {
    it('đưa hàng loạt yêu cầu gom chuyến phân tán (fan-out) cho tất cả Hubs', async () => {
      prismaService.hub.findMany.mockResolvedValue([
        { id: 1, name: 'Hanoi' },
        { id: 2, name: 'HCM' },
      ])
      queueMock.addBulk.mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }] as any)

      const res = await service.autoDispatchGlobalTask()
      expect(res.message).toContain('trên 2 cụm kho trung chuyển')
      expect(res.jobId).toBe('job-1,job-2')
      expect(queueMock.addBulk).toHaveBeenCalledWith([
        { name: 'dispatch-local', data: { hubId: 1 }, opts: { jobId: 'dispatch-hub-1' } },
        { name: 'dispatch-local', data: { hubId: 2 }, opts: { jobId: 'dispatch-hub-2' } },
      ])
    })

    it('văng NotFoundException nếu ko có bất kỳ Hub nào', async () => {
      prismaService.hub.findMany.mockResolvedValue([])

      await expect(service.autoDispatchGlobalTask()).rejects.toThrow(NotFoundException)
      expect(queueMock.addBulk).not.toHaveBeenCalled()
    })
  })

  describe('findAll', () => {
    it('gọi repo.findAll', async () => {
      tripRepo.findAll.mockResolvedValue({ data: [], totalItems: 0 } as any)

      const res = await service.findAll({})
      expect(res).toEqual({ data: [], totalItems: 0 })
      expect(tripRepo.findAll).toHaveBeenCalledWith({})
    })
  })

  describe('getDispatchBoard', () => {
    it('trả về dispatch board theo hub của warehouse staff', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce({ hubId: 5 })
      tripRepo.findPendingOrders.mockResolvedValue([
        {
          id: 101,
          receiverAddress: 'Q10',
          receiverName: 'Lan',
          senderAddress: 'Q7',
          status: 'PENDING',
          totalVolume: 1.2,
          totalWeight: 12,
          trackingCode: 'ORD-101',
        },
      ] as any)
      prismaService.user.findMany.mockResolvedValue([
        {
          fullName: 'Nguyen Van A',
          id: 11,
          phone: '0900000001',
          tripsDriven: [],
        },
      ])
      prismaService.vehicle.findMany.mockResolvedValue([
        {
          capacityVolume: 6,
          capacityWeight: 80,
          id: 21,
          licensePlate: '51A-88888',
          trips: [],
          type: 'TRUCK',
        },
      ])
      prismaService.trip.findMany.mockResolvedValue([
        {
          driver: { fullName: 'Tran Van B', id: 12 },
          id: 88,
          status: 'PENDING',
          stops: [],
          vehicle: {
            capacityVolume: 10,
            capacityWeight: 120,
            id: 21,
            licensePlate: '51A-88888',
          },
        },
      ])

      const result = await service.getDispatchBoard(undefined, {
        roleName: 'WAREHOUSE_STAFF',
        userId: 9,
      } as any)

      expect(result.hubId).toBe(5)
      expect(result.summary.dispatchableOrderCount).toBe(1)
      expect(result.summary.pendingTripCount).toBe(1)
      expect(result.drivers[0]).toMatchObject({
        fullName: 'Nguyen Van A',
        id: 11,
        isAvailable: true,
      })
      expect(tripRepo.findPendingOrders).toHaveBeenCalledWith(5)
    })
  })

  describe('findById', () => {
    it('trả về order nếu tìm thấy', async () => {
      tripRepo.findById.mockResolvedValue({ id: 1 } as any)

      const res = await service.findById(1)
      expect(res).toEqual({ id: 1 })
    })

    it('văng NotFoundException nếu k tìm thấy trip', async () => {
      tripRepo.findById.mockResolvedValue(null)

      await expect(service.findById(999)).rejects.toThrow(NotFoundException)
    })
  })

  describe('updateStatus', () => {
    it('chuyển trạng thái trip không cần tracking thành công', async () => {
      tripRepo.findById.mockResolvedValue({ id: 1 } as any)
      tripRepo.updateTripStatus.mockResolvedValue({ id: 1, status: 'CANCELLED' } as any)

      const res = await service.updateStatus(1, 'CANCELLED' as any)
      expect(res).toEqual({ id: 1, status: 'CANCELLED' })
      expect(tripRepo.updateTripStatus).toHaveBeenCalledWith(1, 'CANCELLED')
    })

    it('văng NotFoundException nếu trip k tồn tại', async () => {
      tripRepo.findById.mockResolvedValue(null)

      await expect(service.updateStatus(999, 'IN_PROGRESS' as any)).rejects.toThrow(NotFoundException)
    })

    it('bắt đầu trip tạo tracking event cho order rồi chuyển trip IN_PROGRESS', async () => {
      tripRepo.findById.mockResolvedValue({
        id: 1,
        driverId: 9,
        status: 'PENDING',
        stops: [
          {
            orderId: 4,
            order: {
              id: 4,
              payment: { method: 'COD', status: 'PENDING' },
              status: 'ASSIGNED',
            },
          },
        ],
      } as any)
      tripRepo.updateTripStatus.mockResolvedValue({ id: 1, status: 'IN_PROGRESS' } as any)

      const res = await service.updateStatus(1, 'IN_PROGRESS' as any)

      expect(res).toEqual({ id: 1, status: 'IN_PROGRESS' })
      expect(tripRepo.updateTripStatus).toHaveBeenCalledWith(
        1,
        'IN_PROGRESS',
        expect.objectContaining({ startTime: expect.any(Date) }),
      )
    })

    it('chặn bắt đầu trip nếu đơn Stripe chưa thanh toán thành công', async () => {
      tripRepo.findById.mockResolvedValue({
        id: 1,
        driverId: 9,
        status: 'PENDING',
        stops: [
          {
            orderId: 4,
            order: {
              id: 4,
              trackingCode: 'ORD-STRIPE-4',
              payment: { method: 'STRIPE', status: 'PENDING' },
              status: 'ASSIGNED',
            },
          },
        ],
      } as any)

      await expect(service.updateStatus(1, 'IN_PROGRESS' as any)).rejects.toThrow(
        'Đơn ORD-STRIPE-4 dùng Stripe và chưa thanh toán thành công nên chưa thể vận chuyển.',
      )
      expect(tripRepo.updateTripStatus).not.toHaveBeenCalled()
    })

    it('hoàn tất trip tạo tracking event giao hàng và cập nhật COMPLETED', async () => {
      tripRepo.findById.mockResolvedValue({
        id: 1,
        driverId: 9,
        status: 'IN_PROGRESS',
        stops: [
          {
            orderId: 4,
            stopType: 'DROPOFF',
            order: { id: 4, status: 'IN_TRANSIT', totalVolume: 1, receiverLat: 10, receiverLng: 106 },
          },
        ],
      } as any)
      prismaService.order.findFirst.mockResolvedValue({
        trackingCode: 'ORD4',
        isCodCollected: false,
        payment: { method: 'STRIPE', status: 'COMPLETED', amount: 1000 },
      })
      tripRepo.updateTripStatus.mockResolvedValue({ id: 1, status: 'COMPLETED' } as any)

      const res = await service.updateStatus(1, {
        status: 'COMPLETED',
        podByOrderId: {
          4: {
            receiverName: 'A',
            packageCondition: 'INTACT',
            images: [{ type: 'PACKAGE', url: 'https://example.com/pod.jpg' }],
          },
        },
      } as any)

      expect(tripRepo.updateTripStatus).toHaveBeenCalledWith(
        1,
        'COMPLETED',
        expect.objectContaining({ endTime: expect.any(Date) }),
      )
      expect(res).toEqual({ id: 1, status: 'COMPLETED' })
    })
  })

  describe('createManualTrip', () => {
    it('chặn tạo chuyến khi xe đang bận ở chuyến khác', async () => {
      prismaService.vehicle.findFirst.mockResolvedValue({ hubId: 5, id: 21 })
      prismaService.user.findFirst.mockResolvedValue({ hubId: 5, id: 12 })
      prismaService.order.findMany.mockResolvedValue([{ currentHubId: 5, id: 1 }])
      prismaService.trip.findFirst.mockResolvedValueOnce({ id: 77 })

      await expect(
        service.createManualTrip(
          {
            driverId: 12,
            hubId: 5,
            orderIds: [1],
            vehicleId: 21,
          } as any,
          { roleName: 'ADMIN', userId: 1 } as any,
        ),
      ).rejects.toThrow('Xe #21 đang bận ở chuyến #77')
    })
  })

  describe('driver assignment requests', () => {
    it('tạo request nhận đơn hợp lệ cho driver cùng hub', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce({ fullName: 'Tran Van B', hubId: 5, id: 12 })
      prismaService.trip.findFirst.mockResolvedValue(null)
      prismaService.order.findFirst.mockResolvedValue({
        id: 101,
        trackingCode: 'ORD-101',
      })
      prismaService.driverAssignmentRequest.findFirst.mockResolvedValue(null)
      prismaService.driverAssignmentRequest.create.mockResolvedValue({
        createdAt: new Date('2026-04-25T09:00:00.000Z'),
        driver: { fullName: 'Tran Van B', id: 12 },
        driverId: 12,
        hubId: 5,
        id: 501,
        order: { currentTrip: null, id: 101, trackingCode: 'ORD-101' },
        orderId: 101,
        reviewNote: null,
        reviewedAt: null,
        reviewedById: null,
        status: 'PENDING',
      })
      prismaService.user.findMany.mockResolvedValue([{ id: 21 }])

      const result = await service.createDriverAssignmentRequest(
        { orderId: 101 } as any,
        { roleName: 'DRIVER', userId: 12 } as any,
      )

      expect(prismaService.driverAssignmentRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            driverId: 12,
            hubId: 5,
            orderId: 101,
          },
        }),
      )
      expect(result).toMatchObject({
        driverId: 12,
        id: 501,
        orderId: 101,
        orderTrackingCode: 'ORD-101',
        status: 'PENDING',
      })
    })

    it('chặn driver tạo request khi đang có chuyến IN_PROGRESS', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce({ fullName: 'Tran Van B', hubId: 5, id: 12 })
      prismaService.trip.findFirst.mockResolvedValue({ id: 88 })

      await expect(
        service.createDriverAssignmentRequest({ orderId: 101 } as any, { roleName: 'DRIVER', userId: 12 } as any),
      ).rejects.toThrow('Tài xế #12 đang chạy chuyến #88')
    })

    it('duyệt request và thêm đơn vào chuyến PENDING duy nhất của tài xế', async () => {
      prismaService.user.findFirst.mockResolvedValue({ hubId: 5 })
      prismaService.driverAssignmentRequest.findUnique.mockResolvedValue({
        createdAt: new Date('2026-04-25T09:00:00.000Z'),
        driver: { fullName: 'Tran Van B', id: 12 },
        driverId: 12,
        hubId: 5,
        id: 501,
        order: {
          currentHubId: 5,
          currentTrip: null,
          currentTripId: null,
          id: 101,
          payment: { method: 'COD', status: 'PENDING' },
          receiverLat: 10.8,
          receiverLng: 106.6,
          senderLat: 10.7,
          senderLng: 106.5,
          status: 'PENDING',
          totalWeight: 12,
          trackingCode: 'ORD-101',
        },
        orderId: 101,
        reviewNote: null,
        reviewedAt: null,
        reviewedById: null,
        status: 'PENDING',
      })
      prismaService.trip.findMany.mockResolvedValue([
        {
          driverId: 12,
          id: 88,
          status: 'PENDING',
          stops: [],
          vehicle: { capacityWeight: 50, hubId: 5, id: 21, licensePlate: '51A-88888' },
        },
      ])
      prismaService.order.findMany.mockResolvedValue([])
      prismaService.$transaction = jest.fn().mockImplementation(async (callback) => {
        const tx = {
          driverAssignmentRequest: {
            findUnique: jest.fn().mockResolvedValue({
              createdAt: new Date('2026-04-25T09:00:00.000Z'),
              driver: { fullName: 'Tran Van B', id: 12 },
              driverId: 12,
              hubId: 5,
              id: 501,
              order: {
                currentTrip: {
                  id: 88,
                  status: 'PENDING',
                  vehicle: { id: 21, licensePlate: '51A-88888' },
                },
                id: 101,
                trackingCode: 'ORD-101',
              },
              orderId: 101,
              reviewNote: null,
              reviewedAt: new Date('2026-04-25T09:10:00.000Z'),
              reviewedById: 9,
              status: 'APPROVED',
            }),
            update: jest.fn().mockResolvedValue(undefined),
            updateMany: jest.fn().mockResolvedValue(undefined),
          },
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          tripStop: {
            create: jest.fn().mockResolvedValue(undefined),
          },
        }
        return callback(tx)
      })

      const result = await service.approveAssignmentRequest(
        501,
        {} as any,
        { roleName: 'WAREHOUSE_STAFF', userId: 9 } as any,
      )

      expect(prismaService.$transaction).toHaveBeenCalled()
      expect(result).toMatchObject({
        id: 501,
        orderTrackingCode: 'ORD-101',
        status: 'APPROVED',
        trip: {
          id: 88,
        },
      })
    })

    it('từ chối request với review note', async () => {
      prismaService.user.findFirst.mockResolvedValue({ hubId: 5 })
      prismaService.driverAssignmentRequest.findUnique.mockResolvedValue({
        createdAt: new Date('2026-04-25T09:00:00.000Z'),
        driver: { fullName: 'Tran Van B', id: 12 },
        driverId: 12,
        hubId: 5,
        id: 501,
        order: { currentTrip: null, id: 101, trackingCode: 'ORD-101' },
        orderId: 101,
        reviewNote: null,
        reviewedAt: null,
        reviewedById: null,
        status: 'PENDING',
      })
      prismaService.driverAssignmentRequest.update.mockResolvedValue({
        createdAt: new Date('2026-04-25T09:00:00.000Z'),
        driver: { fullName: 'Tran Van B', id: 12 },
        driverId: 12,
        hubId: 5,
        id: 501,
        order: { currentTrip: null, id: 101, trackingCode: 'ORD-101' },
        orderId: 101,
        reviewNote: 'Xe đang đầy tải',
        reviewedAt: new Date('2026-04-25T09:20:00.000Z'),
        reviewedById: 9,
        status: 'REJECTED',
      })

      const result = await service.rejectAssignmentRequest(
        501,
        { reviewNote: 'Xe đang đầy tải' } as any,
        { roleName: 'WAREHOUSE_STAFF', userId: 9 } as any,
      )

      expect(prismaService.driverAssignmentRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewNote: 'Xe đang đầy tải',
            status: 'REJECTED',
          }),
        }),
      )
      expect(result.reviewNote).toBe('Xe đang đầy tải')
    })
  })

  describe('assignVehicleToTrip', () => {
    it('cho phép đổi cả xe và tài xế cho chuyến PENDING', async () => {
      tripRepo.findById.mockResolvedValue({
        driverId: 12,
        id: 88,
        status: 'PENDING',
        stops: [{ orderId: 101, order: { currentHubId: 5 } }],
        vehicle: { hubId: 5 },
      } as any)
      prismaService.vehicle.findUnique.mockResolvedValue({
        capacityWeight: 90,
        hubId: 5,
        id: 21,
      })
      prismaService.vehicle.findFirst.mockResolvedValue({ hubId: 5, id: 21 })
      prismaService.user.findFirst.mockResolvedValue({ hubId: 5, id: 12 })
      prismaService.order.findMany = jest
        .fn()
        .mockResolvedValueOnce([{ currentHubId: 5, id: 101 }])
        .mockResolvedValueOnce([{ id: 101, totalWeight: 12 }])
      prismaService.trip.findFirst.mockResolvedValue(null)
      prismaService.trip.update = jest.fn().mockResolvedValue({
        driverId: 12,
        id: 88,
        vehicleId: 21,
      })

      const result = await service.assignVehicleToTrip(88, {
        driverId: 12,
        vehicleId: 21,
      } as any)

      expect(prismaService.trip.update).toHaveBeenCalledWith({
        data: { driverId: 12, vehicleId: 21 },
        include: { stops: true },
        where: { id: 88 },
      })
      expect(result).toEqual({
        driverId: 12,
        id: 88,
        vehicleId: 21,
      })
    })
  })

  describe('cancelOrderFromTrip', () => {
    it('hủy order khỏi trip qua repository', async () => {
      tripRepo.findById.mockResolvedValue({ id: 3 } as any)
      tripRepo.cancelOrderFromTrip = jest.fn().mockResolvedValue({ tripCancelled: false } as any)

      const res = await service.cancelOrderFromTrip(3, 99)

      expect(tripRepo.cancelOrderFromTrip).toHaveBeenCalledWith(3, 99)
      expect(res).toEqual({ tripCancelled: false })
    })

    it('văng NotFoundException nếu trip không tồn tại', async () => {
      tripRepo.findById.mockResolvedValue(null)

      await expect(service.cancelOrderFromTrip(3, 99)).rejects.toThrow(NotFoundException)
    })
  })
})
