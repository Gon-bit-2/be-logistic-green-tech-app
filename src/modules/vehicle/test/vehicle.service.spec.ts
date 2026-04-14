import { Test, TestingModule } from '@nestjs/testing';
import { VehicleService } from '../service/vehicle.service';
import { VehicleRepository } from '../repository/vehicle.repo';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FuelType, VehicleType } from 'src/common/constants/vehicle.constant';

describe('VehicleService', () => {
  let service: VehicleService;
  let repo: jest.Mocked<VehicleRepository>;

  beforeEach(async () => {
    const repoMock = {
      findByLicensePlate: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleService,
        {
          provide: VehicleRepository,
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get<VehicleService>(VehicleService);
    repo = module.get(VehicleRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('thêm mới thành công nếu biển số chưa tồn tại', async () => {
      repo.findByLicensePlate.mockResolvedValue(null);
      
      const payload = { 
        licensePlate: '29A-12345', 
        type: VehicleType.TRUCK, 
        fuelType: FuelType.DIESEL, 
        capacityIndex: 1, 
        emissionRatePerKm: 1, 
        hubId: 1 
      };
      const createdObj = { id: 1, ...payload };
      repo.create.mockResolvedValue(createdObj as any);

      const result = await service.create(1, payload);
      expect(result).toEqual(createdObj);
      expect(repo.findByLicensePlate).toHaveBeenCalledWith('29A-12345');
      expect(repo.create).toHaveBeenCalledWith(1, payload);
    });

    it('văng lỗi ConflictException nếu biển số đã tồn tại', async () => {
      repo.findByLicensePlate.mockResolvedValue({ id: 1 } as any);
      
      const payload = { 
        licensePlate: '29A-12345', 
        type: VehicleType.TRUCK, 
        fuelType: FuelType.DIESEL, 
        capacityIndex: 1, 
        emissionRatePerKm: 1, 
        hubId: 1 
      };
      
      await expect(service.create(1, payload)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('gọi hàm findAll của repo', async () => {
      repo.findAll.mockResolvedValue({ data: [], totalItems: 0 } as any);
      const res = await service.findAll({});
      expect(res).toEqual({ data: [], totalItems: 0 });
      expect(repo.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('findById', () => {
    it('trả ra đối tượng nếu ID tồn tại', async () => {
      repo.findById.mockResolvedValue({ id: 1 } as any);
      const res = await service.findById(1);
      expect(res).toEqual({ id: 1 });
      expect(repo.findById).toHaveBeenCalledWith(1);
    });

    it('văng NotFoundException nếu không tìm thấy', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('update thành công nếu đúng id và k đổi license plate', async () => {
      repo.findById.mockResolvedValue({ id: 1, licensePlate: 'OLD' } as any);
      repo.update.mockResolvedValue({ id: 1 } as any);

      const res = await service.update(2, 1, { capacityIndex: 5 });
      expect(res).toEqual({ id: 1 });
      expect(repo.update).toHaveBeenCalledWith(2, 1, { capacityIndex: 5 });
    });

    it('update thành công khi đổi license plate chưa người nào dùng', async () => {
      repo.findById.mockResolvedValue({ id: 1, licensePlate: 'OLD' } as any);
      repo.findByLicensePlate.mockResolvedValue(null);
      repo.update.mockResolvedValue({ id: 1 } as any);

      const res = await service.update(2, 1, { licensePlate: 'NEW' });
      expect(res).toEqual({ id: 1 });
    });

    it('văng ConflictException nếu license plate mới đã đc 1 id KHÁC sử dụng', async () => {
      repo.findById.mockResolvedValue({ id: 1, licensePlate: 'OLD' } as any);
      repo.findByLicensePlate.mockResolvedValue({ id: 2 } as any); // id 2 đang dùng

      await expect(service.update(2, 1, { licensePlate: 'NEW' })).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('xóa thành công', async () => {
      repo.findById.mockResolvedValue({ id: 1 } as any);
      repo.delete.mockResolvedValue({ success: true } as any);

      const res = await service.delete({ id: 1, deletedById: 2 });
      expect(res).toEqual({ success: true });
      expect(repo.delete).toHaveBeenCalledWith({ id: 1, deletedById: 2 });
    });

    it('văng NotFoundException nếu k có element để xóa', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.delete({ id: 1, deletedById: 2 })).rejects.toThrow(NotFoundException);
    });
  });
});
