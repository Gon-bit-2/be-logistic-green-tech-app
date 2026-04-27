// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing'
import { HubService } from '../service/hub.service'
import { HubRepository } from '../repository/hub.repo'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import roleName from 'src/common/constants/role.constant'

describe('HubService', () => {
  let service: HubService
  let hubRepo: jest.Mocked<HubRepository>
  let authRepo: jest.Mocked<AuthRepository>

  beforeEach(async () => {
    const hubRepoMock = {
      findByCode: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      assignStaff: jest.fn(),
      removeStaff: jest.fn(),
    }

    const userRepoMock = {
      findUniqueIncludeRolePermissions: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HubService,
        {
          provide: HubRepository,
          useValue: hubRepoMock,
        },
        {
          provide: AuthRepository,
          useValue: userRepoMock,
        },
      ],
    }).compile()

    service = module.get<HubService>(HubService)
    hubRepo = module.get(HubRepository)
    authRepo = module.get(AuthRepository)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('thêm mới thành công nếu mã hub chưa tồn tại', async () => {
      hubRepo.findByCode.mockResolvedValue(null)
      const payload = {
        code: 'HUB01',
        name: 'Hub 1',
        address: 'Binh Thanh, HCM',
        latitude: 10.123,
        longitude: 106.123,
        capacity: 1000,
        isActive: true,
      }
      const createdObj = { id: 1, ...payload }
      hubRepo.create.mockResolvedValue(createdObj as any)

      const result = await service.create(payload)
      expect(result).toEqual(createdObj)
      expect(hubRepo.findByCode).toHaveBeenCalledWith('HUB01')
      expect(hubRepo.create).toHaveBeenCalledWith(payload)
    })

    it('văng ConflictException nếu code đã tồn tại', async () => {
      hubRepo.findByCode.mockResolvedValue({ id: 1 } as any)
      const payload = {
        code: 'HUB01',
        name: 'Hub 1',
        address: 'Binh Thanh, HCM',
        latitude: 10.123,
        longitude: 106.123,
        capacity: 1000,
        isActive: true,
      }

      await expect(service.create(payload)).rejects.toThrow(ConflictException)
    })
  })

  describe('findAll', () => {
    it('gọi hàm findAll của repo', async () => {
      hubRepo.findAll.mockResolvedValue({ data: [], totalItems: 0 } as any)
      const res = await service.findAll({})
      expect(res).toEqual({ data: [], totalItems: 0 })
      expect(hubRepo.findAll).toHaveBeenCalledWith({})
    })
  })

  describe('findById', () => {
    it('trả ra đối tượng nếu ID tồn tại', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1 } as any)
      const res = await service.findById(1)
      expect(res).toEqual({ id: 1 })
      expect(hubRepo.findById).toHaveBeenCalledWith(1)
    })

    it('văng NotFoundException nếu không tìm thấy', async () => {
      hubRepo.findById.mockResolvedValue(null)
      await expect(service.findById(999)).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('update thành công nếu đúng id và k đổi code', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1, code: 'OLD' } as any)
      hubRepo.update.mockResolvedValue({ id: 1 } as any)

      const res = await service.update(1, { capacity: 5000 })
      expect(res).toEqual({ id: 1 })
      expect(hubRepo.update).toHaveBeenCalledWith(1, { capacity: 5000 })
    })

    it('update thành công khi đổi code chưa ai dùng', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1, code: 'OLD' } as any)
      hubRepo.findByCode.mockResolvedValue(null)
      hubRepo.update.mockResolvedValue({ id: 1 } as any)

      const res = await service.update(1, { code: 'NEW' })
      expect(res).toEqual({ id: 1 })
    })

    it('văng ConflictException nếu code mới đã đc 1 id KHÁC sử dụng', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1, code: 'OLD' } as any)
      hubRepo.findByCode.mockResolvedValue({ id: 2 } as any)

      await expect(service.update(1, { code: 'NEW' })).rejects.toThrow(ConflictException)
    })
  })

  describe('delete', () => {
    it('xóa thành công', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1 } as any)
      hubRepo.delete.mockResolvedValue({ success: true } as any)

      const res = await service.delete(1, 2)
      expect(res).toEqual({ success: true })
      expect(hubRepo.delete).toHaveBeenCalledWith(1, 2)
    })
  })

  describe('assignStaff', () => {
    it('gán nhân viên thành công nếu role là WAREHOUSE_STAFF', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1 } as any)
      authRepo.findUniqueIncludeRolePermissions.mockResolvedValue({
        id: 99,
        role: { name: roleName.WAREHOUSE_STAFF },
      } as any)
      hubRepo.assignStaff.mockResolvedValue({ id: 1 } as any)

      const res = await service.assignStaff(1, 99)
      expect(res).toEqual({ id: 1 })
      expect(hubRepo.assignStaff).toHaveBeenCalledWith(1, 99)
    })

    it('quăng NotFoundException nếu không có user', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1 } as any)
      authRepo.findUniqueIncludeRolePermissions.mockResolvedValue(null)

      await expect(service.assignStaff(1, 99)).rejects.toThrow(NotFoundException)
    })

    it('quăng BadRequestException nếu role KHÔNG phải WAREHOUSE_STAFF', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1 } as any)
      authRepo.findUniqueIncludeRolePermissions.mockResolvedValue({ id: 99, role: { name: roleName.DRIVER } } as any)

      await expect(service.assignStaff(1, 99)).rejects.toThrow(BadRequestException)
    })
  })

  describe('removeStaff', () => {
    it('xóa nhân viên thành công nếu hợp quy', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1 } as any)
      authRepo.findUniqueIncludeRolePermissions.mockResolvedValue({
        id: 99,
        hubId: 1, // Must be in the hub
        role: { name: roleName.WAREHOUSE_STAFF },
      } as any)
      hubRepo.removeStaff.mockResolvedValue({ id: 99 } as any)

      const res = await service.removeStaff(1, 99)
      expect(res).toEqual({ id: 99 })
      expect(hubRepo.removeStaff).toHaveBeenCalledWith(99)
    })

    it('văng BadRequestException nếu hubId của user k khớp', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1 } as any)
      authRepo.findUniqueIncludeRolePermissions.mockResolvedValue({
        id: 99,
        hubId: 2,
        role: { name: roleName.WAREHOUSE_STAFF },
      } as any)

      await expect(service.removeStaff(1, 99)).rejects.toThrow(BadRequestException)
    })

    it('văng BadRequestException nếu role k đúng', async () => {
      hubRepo.findById.mockResolvedValue({ id: 1 } as any)
      authRepo.findUniqueIncludeRolePermissions.mockResolvedValue({
        id: 99,
        hubId: 1,
        role: { name: roleName.CUSTOMER },
      } as any)

      await expect(service.removeStaff(1, 99)).rejects.toThrow(BadRequestException)
    })
  })
})
