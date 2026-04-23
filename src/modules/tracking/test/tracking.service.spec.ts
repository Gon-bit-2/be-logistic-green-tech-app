// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { TrackingService } from '../service/tracking.service';
import { TrackingRepository } from '../repository/tracking.repo';
import { PrismaService } from 'src/database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { CALCULATE_EMISSION_JOB_NAME, GREEN_TECH_QUEUE_NAME } from 'src/common/constants/queue.constant';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TRACKING_EVENT_TYPE } from 'src/common/constants/tracking.constant';
import { ORDER_STATUS } from 'src/common/constants/order.constant';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEventName } from 'src/modules/notification/events/notification.event';
import { ForbiddenException } from '@nestjs/common';

describe('TrackingService', () => {
  let service: TrackingService;
  let trackingRepo: jest.Mocked<TrackingRepository>;
  let prismaService: any;
  let greenTechQueue: jest.Mocked<Queue>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const trackingRepoMock = {
      countFailedAttempts: jest.fn(),
      createEventWithStatusUpdate: jest.fn(),
      findByOrderId: jest.fn(),
    };

    const prismaServiceMock = {
      order: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      trip: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const queueFactoryMock = {
      add: jest.fn(),
    };

    const eventEmitterMock = {
      emitAsync: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingService,
        {
          provide: TrackingRepository,
          useValue: trackingRepoMock,
        },
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
        {
          provide: getQueueToken(GREEN_TECH_QUEUE_NAME),
          useValue: queueFactoryMock,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitterMock,
        },
      ],
    }).compile();

    service = module.get<TrackingService>(TrackingService);
    trackingRepo = module.get(TrackingRepository);
    prismaService = module.get(PrismaService);
    greenTechQueue = module.get(getQueueToken(GREEN_TECH_QUEUE_NAME));
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    it('Tạo event bình thường + chuyển trạng thái hợp lệ', async () => {
      prismaService.order.findFirst.mockResolvedValue({
        id: 1,
        customerId: 7,
        trackingCode: 'ORD001',
        status: ORDER_STATUS.PENDING,
        currentHubId: 5,
      });
      trackingRepo.createEventWithStatusUpdate.mockResolvedValue({ id: 10 } as any);

      const payload = {
        orderId: 1,
        eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE,
        status: ORDER_STATUS.ASSIGNED, // PENDING -> ASSIGNED (hợp lệ)
      };

      const result = await service.createEvent({ userId: 1, roleName: 'ADMIN' } as any, payload as any);

      expect(result).toEqual({ id: 10 });
      expect(trackingRepo.createEventWithStatusUpdate).toHaveBeenCalledWith(1, payload, true);
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('văng NotFoundException nếu order ko tồn tại', async () => {
      prismaService.order.findFirst.mockResolvedValue(null);
      await expect(
        service.createEvent({ userId: 1, roleName: 'ADMIN' } as any, { orderId: 1 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('văng lỗi BadRequestException khi chuyển trạng thái sai logic (Vd: PENDING -> DELIVERED)', async () => {
      prismaService.order.findFirst.mockResolvedValue({
        id: 1,
        customerId: 7,
        trackingCode: 'ORD001',
        status: ORDER_STATUS.PENDING,
        currentHubId: 5,
      });

      const payload = { orderId: 1, eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE, status: ORDER_STATUS.DELIVERED };
      // PENDING không thể chuyển ngay sang DELIVERED (theo constant)
      await expect(service.createEvent({ userId: 1, roleName: 'ADMIN' } as any, payload as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('vượt MAX_DELIVERY_ATTEMPTS thì văng BadRequestException khi cố Exception', async () => {
      prismaService.order.findFirst.mockResolvedValue({
        id: 1,
        customerId: 7,
        trackingCode: 'ORD001',
        status: ORDER_STATUS.OUT_FOR_DELIVERY,
        currentHubId: 5,
      });
      trackingRepo.countFailedAttempts.mockResolvedValue(3); // Giả lập đã fail 3 lần (cả lần hiện tại)

      const payload = {
        orderId: 1,
        eventType: TRACKING_EVENT_TYPE.EXCEPTION,
        failureReasonCode: 'NOT_HOME',
      };

      await expect(service.createEvent({ userId: 1, roleName: 'ADMIN' } as any, payload as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('khi DELIVERED thì tự động enqueue BullMQ cập nhật trip status', async () => {
      prismaService.order.findFirst.mockResolvedValue({
        id: 1,
        customerId: 7,
        trackingCode: 'ORD001',
        status: ORDER_STATUS.OUT_FOR_DELIVERY,
        currentTripId: 100,
        currentHubId: 5,
      });
      trackingRepo.createEventWithStatusUpdate.mockResolvedValue({ id: 10 } as any);
      
      // Giả lập trip đã hoàn tất tất cả đơn hàng
      prismaService.trip.findUnique.mockResolvedValue({
        id: 100,
        status: 'IN_PROGRESS',
        ordersOnBoard: [
          { id: 1, status: ORDER_STATUS.DELIVERED }, 
        ]
      });

      const payload = {
        orderId: 1,
        eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE,
        status: ORDER_STATUS.DELIVERED, // OUT_FOR_DELIVERY -> DELIVERED (hợp lệ)
      };

      await service.createEvent({ userId: 1, roleName: 'ADMIN' } as any, payload as any);

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(NotificationEventName.ORDER_STATUS_UPDATED, {
        userId: 7,
        orderId: 1,
        trackingCode: 'ORD001',
        status: ORDER_STATUS.DELIVERED,
      });

      expect(prismaService.trip.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
      // Test GreenTech Queue added
      expect(greenTechQueue.add).toHaveBeenCalledWith(CALCULATE_EMISSION_JOB_NAME, { tripId: 100 });
    });

    it('bắn notification khi đơn chuyển sang OUT_FOR_DELIVERY', async () => {
      prismaService.order.findFirst.mockResolvedValue({
        id: 2,
        customerId: 9,
        trackingCode: 'ORD002',
        status: ORDER_STATUS.IN_TRANSIT,
        currentTripId: null,
        currentHubId: 5,
      });
      trackingRepo.createEventWithStatusUpdate.mockResolvedValue({ id: 11 } as any);

      await service.createEvent({ userId: 1, roleName: 'ADMIN' } as any, {
        orderId: 2,
        eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE,
        status: ORDER_STATUS.OUT_FOR_DELIVERY,
      } as any);

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(NotificationEventName.ORDER_STATUS_UPDATED, {
        userId: 9,
        orderId: 2,
        trackingCode: 'ORD002',
        status: ORDER_STATUS.OUT_FOR_DELIVERY,
      });
    });

    it('chặn warehouse staff tạo event cho đơn ngoài hub của mình', async () => {
      prismaService.order.findFirst.mockResolvedValue({
        id: 3,
        customerId: 10,
        trackingCode: 'ORD003',
        status: ORDER_STATUS.ARRIVED_AT_HUB,
        currentTripId: null,
        currentHubId: 9,
      });
      prismaService.user.findFirst.mockResolvedValue({ hubId: 8 });

      await expect(
        service.createEvent(
          { userId: 15, roleName: 'WAREHOUSE_STAFF' } as any,
          {
            orderId: 3,
            eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE,
            status: ORDER_STATUS.OUT_FOR_DELIVERY,
          } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(trackingRepo.createEventWithStatusUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getTimeline', () => {
    it('Lấy timeline bình thường', async () => {
      prismaService.order.findFirst.mockResolvedValue({ id: 1, trackingCode: 'CODE123', status: 'PENDING' });
      trackingRepo.findByOrderId.mockResolvedValue([{ id: 1 }] as any);

      const res = await service.getTimeline(1);
      expect(res).toEqual({
        trackingCode: 'CODE123',
        currentStatus: 'PENDING',
        events: [{ id: 1 }],
      });
    });

    it('văng NotFoundException khi order k tồn tại', async () => {
      prismaService.order.findFirst.mockResolvedValue(null);
      await expect(service.getTimeline(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicTimeline', () => {
    it('public timeline sẽ ẩn data nhạy cảm (VD: Ảnh hư hỏng nội bộ)', async () => {
      prismaService.order.findFirst.mockResolvedValue({ id: 1, trackingCode: 'CODE123', status: 'DELIVERED' });
      
      const events = [
        {
          id: 1,
          eventType: TRACKING_EVENT_TYPE.POD,
          status: ORDER_STATUS.DELIVERED,
          location: 'somewhere',
          description: 'delivered',
          occurredAt: new Date('2026-01-01T00:00:00.000Z'),
          pod: {
            receiverName: 'John',
            packageCondition: 'Good',
            images: [
              { url: 'img1.png', type: 'SIGNATURE' },
              { url: 'img2.png', type: 'DAMAGE_EVIDENCE' }, // Ảnh nhạy cảm, public không được hiện
            ]
          }
        }
      ];
      trackingRepo.findByOrderId.mockResolvedValue(events as any);

      const res = await service.getPublicTimeline('CODE123');

      // Check format + sanitize
      expect(res.events[0].pod.images).toHaveLength(1); // Chỉ còn SIGNATURE
      expect(res.events[0].pod.images[0].type).toBe('SIGNATURE');
    });

    it('văng lỗi nếu ko tìm thấy theo mã vạch', async () => {
      prismaService.order.findFirst.mockResolvedValue(null);
      await expect(service.getPublicTimeline('NOPE')).rejects.toThrow(NotFoundException);
    });
  });
});
