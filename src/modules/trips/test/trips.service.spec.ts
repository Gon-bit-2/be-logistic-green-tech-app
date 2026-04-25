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
    }

    const prismaServiceMock = {
      hub: {
        findMany: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
      },
    }

    const queueFactoryMock = {
      add: jest.fn(),
      addBulk: jest.fn(),
    }

    const eventEmitterMock = {
      emit: jest.fn(),
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
        stops: [{ orderId: 4, order: { id: 4, status: 'ASSIGNED' } }],
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
