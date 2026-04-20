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
    }

    const prismaServiceMock = {
      hub: {
        findMany: jest.fn(),
      },
    }

    const queueFactoryMock = {
      add: jest.fn(),
      addBulk: jest.fn(),
    }

    gamificationServiceMock = {
      processTripEmission: jest.fn().mockResolvedValue(undefined),
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
    it('chuyển trạng thái trip thành công', async () => {
      tripRepo.findById.mockResolvedValue({ id: 1 } as any)
      tripRepo.updateTripStatus.mockResolvedValue({ id: 1, status: 'IN_PROGRESS' } as any)

      const res = await service.updateStatus(1, 'IN_PROGRESS' as any)
      expect(res).toEqual({ id: 1, status: 'IN_PROGRESS' })
      expect(tripRepo.updateTripStatus).toHaveBeenCalledWith(1, 'IN_PROGRESS')
    })

    it('văng NotFoundException nếu trip k tồn tại', async () => {
      tripRepo.findById.mockResolvedValue(null)

      await expect(service.updateStatus(999, 'IN_PROGRESS' as any)).rejects.toThrow(NotFoundException)
    })

    it('gọi completeTrip khi chuyển sang COMPLETED', async () => {
      tripRepo.findById.mockResolvedValue({ id: 1 } as any)
      prismaService.hub.findMany.mockResolvedValue([
        {
          id: 1,
          latitude: 10.7,
          longitude: 106.6,
          capacityVolume: 1000,
          ordersCurrentlyHere: [],
        },
      ])
      tripRepo.completeTrip = jest.fn().mockResolvedValue({ id: 1, status: 'COMPLETED' } as any)

      const res = await service.updateStatus(1, 'COMPLETED' as any)

      expect(prismaService.hub.findMany).toHaveBeenCalled()
      expect(tripRepo.completeTrip).toHaveBeenCalledWith(
        1,
        expect.arrayContaining([expect.objectContaining({ id: 1 })]),
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
