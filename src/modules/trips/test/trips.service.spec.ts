import { Test, TestingModule } from '@nestjs/testing';
import { StripsService } from '../service/trips.service';
import { StripRepository } from '../repository/trip.repository';
import { PrismaService } from 'src/database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant';
import { NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';

describe('StripsService', () => {
  let service: StripsService;
  let stripRepo: jest.Mocked<StripRepository>;
  let prismaService: any;
  let queueMock: jest.Mocked<Queue>;

  beforeEach(async () => {
    const stripRepoMock = {
      findAll: jest.fn(),
      findById: jest.fn(),
      updateTripStatus: jest.fn(),
    };

    const prismaServiceMock = {
      hub: {
        findMany: jest.fn(),
      },
    };

    const queueFactoryMock = {
      add: jest.fn(),
      addBulk: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripsService,
        {
          provide: StripRepository,
          useValue: stripRepoMock,
        },
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
        {
          provide: getQueueToken(AUTO_DISPATCH_QUEUE_NAME),
          useValue: queueFactoryMock,
        },
      ],
    }).compile();

    service = module.get<StripsService>(StripsService);
    stripRepo = module.get(StripRepository);
    prismaService = module.get(PrismaService);
    queueMock = module.get(getQueueToken(AUTO_DISPATCH_QUEUE_NAME));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('autoDispatchLocalTask', () => {
    it('đưa yêu cầu gom chuyến riêng cho 1 hub vào queue', async () => {
      queueMock.add.mockResolvedValue({ id: 'job-1' } as any);

      const res = await service.autoDispatchLocalTask(5);
      expect(res).toEqual({
        message: 'Đã đưa yêu cầu gom chuyến cho Hub 5 vào hàng đợi xử lý ngầm.',
        jobId: 'job-1',
      });
      expect(queueMock.add).toHaveBeenCalledWith('dispatch-local', { hubId: 5 });
    });
  });

  describe('autoDispatchGlobalTask', () => {
    it('đưa hàng loạt yêu cầu gom chuyến phân tán (fan-out) cho tất cả Hubs', async () => {
      prismaService.hub.findMany.mockResolvedValue([
        { id: 1, name: 'Hanoi' },
        { id: 2, name: 'HCM' },
      ]);
      queueMock.addBulk.mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }] as any);

      const res = await service.autoDispatchGlobalTask();
      expect(res.message).toContain('trên 2 cụm kho trung chuyển');
      expect(res.jobId).toBe('job-1,job-2');
      expect(queueMock.addBulk).toHaveBeenCalledWith([
        { name: 'dispatch-local', data: { hubId: 1 } },
        { name: 'dispatch-local', data: { hubId: 2 } },
      ]);
    });

    it('văng NotFoundException nếu ko có bất kỳ Hub nào', async () => {
      prismaService.hub.findMany.mockResolvedValue([]);

      await expect(service.autoDispatchGlobalTask()).rejects.toThrow(NotFoundException);
      expect(queueMock.addBulk).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('gọi repo.findAll', async () => {
      stripRepo.findAll.mockResolvedValue({ data: [], totalItems: 0 } as any);
      
      const res = await service.findAll({});
      expect(res).toEqual({ data: [], totalItems: 0 });
      expect(stripRepo.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('findById', () => {
    it('trả về order nếu tìm thấy', async () => {
      stripRepo.findById.mockResolvedValue({ id: 1 } as any);

      const res = await service.findById(1);
      expect(res).toEqual({ id: 1 });
    });

    it('văng NotFoundException nếu k tìm thấy trip', async () => {
      stripRepo.findById.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('chuyển trạng thái trip thành công', async () => {
      stripRepo.findById.mockResolvedValue({ id: 1 } as any);
      stripRepo.updateTripStatus.mockResolvedValue({ id: 1, status: 'SHIPPING' } as any);

      const res = await service.updateStatus(1, 'SHIPPING' as any);
      expect(res).toEqual({ id: 1, status: 'SHIPPING' });
      expect(stripRepo.updateTripStatus).toHaveBeenCalledWith(1, 'SHIPPING');
    });

    it('văng NotFoundException nếu trip k tồn tại', async () => {
      stripRepo.findById.mockResolvedValue(null);

      await expect(service.updateStatus(999, 'SHIPPING' as any)).rejects.toThrow(NotFoundException);
    });
  });
});
