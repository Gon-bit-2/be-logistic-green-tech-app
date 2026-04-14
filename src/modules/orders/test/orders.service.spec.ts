import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from '../service/orders.service';
import { OrderRepository } from '../repository/order.repo';
import { PrismaService } from 'src/database/prisma.service';

// Mock calculateHaversineDistance before testing
jest.mock('src/utils/geo.util', () => ({
  calculateHaversineDistance: jest.fn(),
}));
import { calculateHaversineDistance } from 'src/utils/geo.util';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepo: jest.Mocked<OrderRepository>;
  let prismaService: any; // Mucking Prisma is easier by object assignment

  beforeEach(async () => {
    const orderRepoMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const prismaServiceMock = {
      hub: {
        findMany: jest.fn(),
      },
    };

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
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    orderRepo = module.get(OrderRepository);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('Tính toán phí giao < 10km, gán hub gần nhất thành công (geo-fencing)', async () => {
      // Giả lập Hub active
      prismaService.hub.findMany.mockResolvedValue([
        { id: 1, latitude: 10.1, longitude: 106.1, name: 'Hub 1' },
      ]);
      // Giả lập khoảng cách
      (calculateHaversineDistance as jest.Mock).mockReturnValue(5); // 5km
      // Giả lập response từ repo
      orderRepo.create.mockResolvedValue({ id: 100 } as any);

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
      }; // Tổng weight = 5kg

      const result = await service.create(1, 2, payload as any);

      expect(result).toEqual({ order: { id: 100 } });
      expect(prismaService.hub.findMany).toHaveBeenCalled();
      
      // Kiểm tra giá trị truyền vào repo.create: totalWeight = 5, distanceKm = 5, heavyFee = 0 => base(15000) + 5*5500(27500) = 42500
      expect(orderRepo.create).toHaveBeenCalledWith(
        1,
        2,
        payload,
        expect.objectContaining({
          totalWeight: 5,
          currentHubId: 1,
          shippingFee: 42500, // 15000 + 5*5500
          estimatedCo2Saved: 5 * 0.05 // 0.25
        })
      );
    });

    it('Tính toán phí giao > 10km và Phụ phí hàng nặng (Heavy Fee > 5kg) và Gán đơn mồ côi (khi ko có Hub)', async () => {
      prismaService.hub.findMany.mockResolvedValue([]); // Không có Hub hoạt động -> mồ côi
      
      (calculateHaversineDistance as jest.Mock).mockReturnValue(15); // 15km
      orderRepo.create.mockResolvedValue({ id: 101 } as any);

      const payload = {
        senderLat: 10.0,
        senderLng: 106.0,
        receiverLat: 10.15,
        receiverLng: 106.15,
        items: [
          { name: 'item', weight: 4, quantity: 2 }, // Total weight = 8kg
        ],
      };

      await service.create(1, 2, payload as any);

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
        })
      );
    });
  });

  describe('findAll', () => {
    it('gọi hàm findAll của repo', async () => {
      orderRepo.findAll.mockResolvedValue({ data: [], totalItems: 0 } as any);
      const res = await service.findAll({});
      expect(res).toEqual({ data: [], totalItems: 0 });
      expect(orderRepo.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('findById', () => {
    it('trả ra đối tượng nếu ID tồn tại', async () => {
      orderRepo.findById.mockResolvedValue({ id: 1 } as any);
      const res = await service.findById(1);
      expect(res).toEqual({ id: 1 });
      expect(orderRepo.findById).toHaveBeenCalledWith(1);
    });
  });

  describe('update & delete', () => {
    it('gọi hàm update của repo', async () => {
      orderRepo.update.mockResolvedValue({ id: 1 } as any);
      const payload: any = { status: 'SHIPPING' };
      const res = await service.update(1, payload);
      expect(res).toEqual({ id: 1 });
      expect(orderRepo.update).toHaveBeenCalledWith(1, payload);
    });

    it('gọi hàm delete của repo', async () => {
      orderRepo.delete.mockResolvedValue({ id: 1 } as any);
      const res = await service.delete(1, 2);
      expect(res).toEqual({ id: 1 });
      expect(orderRepo.delete).toHaveBeenCalledWith({ id: 1, deletedById: 2 });
    });
  });
});
