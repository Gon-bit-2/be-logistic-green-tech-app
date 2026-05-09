import { Test, TestingModule } from '@nestjs/testing'
import { VehicleService } from '../service/vehicle.service'
import { VehicleRepository } from '../repository/vehicle.repo'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { FuelType, VehicleType } from 'src/common/constants/vehicle.constant'
import type { CreateVehicleBodyType, GetAllVehiclesResType, VehicleSchemaType } from '../model/vehicle.model'

type VehicleRepoMock = jest.Mocked<
  Pick<VehicleRepository, 'create' | 'delete' | 'findAll' | 'findById' | 'findByLicensePlate' | 'update'>
>

const vehicleFixture = (overrides: Partial<VehicleSchemaType> = {}): VehicleSchemaType => ({
  capacityVolume: 12,
  capacityWeight: 1000,
  createdAt: new Date('2026-05-08T00:00:00.000Z'),
  createdById: 1,
  deletedAt: null,
  deletedById: null,
  emissionRatePerKm: 1,
  fuelType: FuelType.DIESEL,
  hubId: 1,
  id: 1,
  imageUrl: null,
  isActive: true,
  licensePlate: '29A-12345',
  type: VehicleType.TRUCK,
  updatedAt: new Date('2026-05-08T00:00:00.000Z'),
  updatedById: null,
  ...overrides,
})

const createPayload: CreateVehicleBodyType = {
  capacityVolume: 12,
  capacityWeight: 1000,
  emissionRatePerKm: 1,
  fuelType: FuelType.DIESEL,
  hubId: 1,
  licensePlate: '29A-12345',
  type: VehicleType.TRUCK,
}

describe('VehicleService', () => {
  let service: VehicleService
  let repo: VehicleRepoMock

  beforeEach(async () => {
    const repoMock: VehicleRepoMock = {
      findByLicensePlate: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleService,
        {
          provide: VehicleRepository,
          useValue: repoMock,
        },
      ],
    }).compile()

    service = module.get<VehicleService>(VehicleService)
    repo = module.get(VehicleRepository)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('thêm mới thành công nếu biển số chưa tồn tại', async () => {
      repo.findByLicensePlate.mockResolvedValue(null)

      const createdObj = vehicleFixture(createPayload)
      repo.create.mockResolvedValue(createdObj)

      const result = await service.create(1, createPayload)
      expect(result).toEqual(createdObj)
      expect(repo.findByLicensePlate.mock.calls).toContainEqual(['29A-12345'])
      expect(repo.create.mock.calls).toContainEqual([1, createPayload])
    })

    it('văng lỗi ConflictException nếu biển số đã tồn tại', async () => {
      repo.findByLicensePlate.mockResolvedValue(vehicleFixture())

      await expect(service.create(1, createPayload)).rejects.toThrow(ConflictException)
    })
  })

  describe('findAll', () => {
    it('gọi hàm findAll của repo', async () => {
      const listResult: GetAllVehiclesResType = { data: [], totalItems: 0 }
      repo.findAll.mockResolvedValue(listResult)
      const res = await service.findAll({ limit: 10, page: 1 })
      expect(res).toEqual({ data: [], totalItems: 0 })
      expect(repo.findAll.mock.calls).toContainEqual([{ limit: 10, page: 1 }])
    })
  })

  describe('findById', () => {
    it('trả ra đối tượng nếu ID tồn tại', async () => {
      const existingVehicle = vehicleFixture()
      repo.findById.mockResolvedValue(existingVehicle)
      const res = await service.findById(1)
      expect(res).toEqual(existingVehicle)
      expect(repo.findById.mock.calls).toContainEqual([1])
    })

    it('văng NotFoundException nếu không tìm thấy', async () => {
      repo.findById.mockResolvedValue(null)
      await expect(service.findById(999)).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('update thành công nếu đúng id và k đổi license plate', async () => {
      const updatedVehicle = vehicleFixture({ licensePlate: 'OLD' })
      repo.findById.mockResolvedValue(updatedVehicle)
      repo.update.mockResolvedValue(updatedVehicle)

      const res = await service.update(2, 1, { capacityWeight: 5000 })
      expect(res).toEqual(updatedVehicle)
      expect(repo.update.mock.calls).toContainEqual([2, 1, { capacityWeight: 5000 }])
    })

    it('update thành công khi đổi license plate chưa người nào dùng', async () => {
      repo.findById.mockResolvedValue(vehicleFixture({ licensePlate: 'OLD' }))
      repo.findByLicensePlate.mockResolvedValue(null)
      repo.update.mockResolvedValue(vehicleFixture({ licensePlate: 'NEW' }))

      const res = await service.update(2, 1, { licensePlate: 'NEW' })
      expect(res.licensePlate).toBe('NEW')
    })

    it('văng ConflictException nếu license plate mới đã đc 1 id KHÁC sử dụng', async () => {
      repo.findById.mockResolvedValue(vehicleFixture({ licensePlate: 'OLD' }))
      repo.findByLicensePlate.mockResolvedValue(vehicleFixture({ id: 2, licensePlate: 'NEW' }))

      await expect(service.update(2, 1, { licensePlate: 'NEW' })).rejects.toThrow(ConflictException)
    })
  })

  describe('delete', () => {
    it('xóa thành công', async () => {
      const deletedVehicle = vehicleFixture({ deletedAt: new Date('2026-05-08T01:00:00.000Z'), deletedById: 2 })
      repo.findById.mockResolvedValue(vehicleFixture())
      repo.delete.mockResolvedValue(deletedVehicle)

      const res = await service.delete({ id: 1, deletedById: 2 })
      expect(res).toEqual(deletedVehicle)
      expect(repo.delete.mock.calls).toContainEqual([{ id: 1, deletedById: 2 }])
    })

    it('văng NotFoundException nếu k có element để xóa', async () => {
      repo.findById.mockResolvedValue(null)

      await expect(service.delete({ id: 1, deletedById: 2 })).rejects.toThrow(NotFoundException)
    })
  })
})
