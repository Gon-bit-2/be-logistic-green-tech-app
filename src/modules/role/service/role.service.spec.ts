// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { NotificationEmitterService } from 'src/common/services/notification-emitter.service'
import roleName from 'src/common/constants/role.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { PrismaService } from 'src/database/prisma.service'
import { RoleRepository } from '../repository/role.repo'
import { RoleService } from './role.service'
import { NotificationEventName } from 'src/modules/notification/events/notification.event'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

describe('RoleService', () => {
  let service: RoleService
  let roleRepo: jest.Mocked<RoleRepository>
  let authRepo: jest.Mocked<AuthRepository>
  let notificationEmitter: jest.Mocked<NotificationEmitterService>
  let prismaService: jest.Mocked<PrismaService>

  beforeEach(async () => {
    const roleRepoMock = {
      findPendingByRequesterId: jest.fn(),
      createRoleRequest: jest.fn(),
      findManyByRequester: jest.fn(),
      findMany: jest.fn(),
      findById: jest.fn(),
      updateRoleRequest: jest.fn(),
      updateUserRole: jest.fn(),
      findActiveHubById: jest.fn(),
      getRoleIdByName: jest.fn(),
    }

    const authRepoMock = {
      findUniqueIncludeRole: jest.fn(),
      findActiveAdmins: jest.fn(),
    }

    const notificationEmitterMock = {
      emitSafe: jest.fn().mockResolvedValue(undefined),
    }

    const prismaServiceMock = {
      $transaction: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        { provide: RoleRepository, useValue: roleRepoMock },
        { provide: AuthRepository, useValue: authRepoMock },
        { provide: NotificationEmitterService, useValue: notificationEmitterMock },
        { provide: PrismaService, useValue: prismaServiceMock },
      ],
    }).compile()

    service = module.get<RoleService>(RoleService)
    roleRepo = module.get(RoleRepository)
    authRepo = module.get(AuthRepository)
    notificationEmitter = module.get(NotificationEmitterService)
    prismaService = module.get(PrismaService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('tạo request thành công cho DRIVER', async () => {
    authRepo.findUniqueIncludeRole.mockResolvedValue({
      id: 7,
      fullName: 'Alice',
      roleId: 2,
      role: { name: roleName.CUSTOMER },
    } as any)
    roleRepo.findPendingByRequesterId.mockResolvedValue(null)
    roleRepo.findActiveHubById.mockResolvedValue({ id: 5 } as any)
    roleRepo.getRoleIdByName.mockResolvedValue(3)
    roleRepo.createRoleRequest.mockResolvedValue({ id: 11 } as any)
    authRepo.findActiveAdmins.mockResolvedValue([{ id: 1 }, { id: 2 }] as any)

    const result = await service.create(7, {
      targetRoleName: roleName.DRIVER,
      reason: 'Muon lam tai xe',
      hubId: 5,
    })

    expect(result).toEqual({ id: 11 })
    expect(roleRepo.createRoleRequest).toHaveBeenCalledWith({
      requesterId: 7,
      currentRoleId: 2,
      targetRoleId: 3,
      reason: 'Muon lam tai xe',
      assignedHubId: 5,
    })
    expect(notificationEmitter.emitSafe).toHaveBeenCalledWith(
      NotificationEventName.ROLE_REQUEST_SUBMITTED,
      expect.objectContaining({
        recipientUserIds: [1, 2],
        requesterName: 'Alice',
        targetRoleName: roleName.DRIVER,
        roleRequestId: 11,
      }),
    )
  })

  it('chặn target role trùng role hiện tại', async () => {
    authRepo.findUniqueIncludeRole.mockResolvedValue({
      id: 7,
      role: { name: roleName.DRIVER },
      roleId: 3,
    } as any)

    await expect(
      service.create(7, {
        targetRoleName: roleName.DRIVER,
        reason: 'same role',
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('chặn admin tạo role request', async () => {
    authRepo.findUniqueIncludeRole.mockResolvedValue({
      id: 1,
      role: { name: roleName.ADMIN },
      roleId: 1,
    } as any)

    await expect(
      service.create(1, {
        targetRoleName: roleName.DRIVER,
        reason: 'admin request',
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('chặn khi đã có request PENDING', async () => {
    authRepo.findUniqueIncludeRole.mockResolvedValue({
      id: 7,
      fullName: 'Alice',
      role: { name: roleName.CUSTOMER },
      roleId: 2,
    } as any)
    roleRepo.findPendingByRequesterId.mockResolvedValue({ id: 99 } as any)

    await expect(
      service.create(7, {
        targetRoleName: roleName.WAREHOUSE_STAFF,
        reason: 'need access',
      }),
    ).rejects.toThrow(ConflictException)
  })

  it('approve DRIVER cập nhật role và gán hubId', async () => {
    prismaService.$transaction.mockImplementation(async (callback) => {
      return await callback({})
    })
    roleRepo.findById.mockResolvedValue({
      id: 12,
      requesterId: 7,
      targetRoleId: 3,
      status: RoleRequestStatus.PENDING,
      targetRole: { name: roleName.DRIVER },
      assignedHubId: 8,
    } as any)
    roleRepo.findActiveHubById.mockResolvedValue({ id: 8 } as any)
    roleRepo.updateRoleRequest.mockResolvedValue({
      id: 12,
      requesterId: 7,
      targetRole: { name: roleName.DRIVER },
    } as any)

    const result = await service.approve(1, 12, {})

    expect(result).toEqual({
      id: 12,
      requesterId: 7,
      targetRole: { name: roleName.DRIVER },
    })
    expect(roleRepo.updateUserRole).toHaveBeenCalledWith(
      7,
      {
        roleId: 3,
        hubId: 8,
      },
      expect.anything(),
    )
    expect(notificationEmitter.emitSafe).toHaveBeenCalledWith(
      NotificationEventName.ROLE_REQUEST_REVIEWED,
      expect.objectContaining({
        userId: 7,
        status: RoleRequestStatus.APPROVED,
      }),
    )
  })

  it('approve WAREHOUSE_STAFF bắt buộc hubId hợp lệ', async () => {
    prismaService.$transaction.mockImplementation(async (callback) => {
      return await callback({})
    })
    roleRepo.findById.mockResolvedValue({
      id: 13,
      requesterId: 7,
      targetRoleId: 4,
      status: RoleRequestStatus.PENDING,
      targetRole: { name: roleName.WAREHOUSE_STAFF },
    } as any)

    await expect(service.approve(1, 13, {})).rejects.toThrow(BadRequestException)

    roleRepo.findActiveHubById.mockResolvedValue(null)
    await expect(service.approve(1, 13, { hubId: 99 })).rejects.toThrow(NotFoundException)
  })

  it('reject bắt buộc reviewNote và tạo notification đúng recipient', async () => {
    prismaService.$transaction.mockImplementation(async (callback) => {
      return await callback({})
    })
    roleRepo.findById.mockResolvedValue({
      id: 14,
      requesterId: 7,
      status: RoleRequestStatus.PENDING,
      targetRole: { name: roleName.WAREHOUSE_STAFF },
    } as any)
    roleRepo.updateRoleRequest.mockResolvedValue({
      id: 14,
      requesterId: 7,
      targetRole: { name: roleName.WAREHOUSE_STAFF },
    } as any)

    const result = await service.reject(1, 14, { reviewNote: 'Khong phu hop' })

    expect(result).toEqual({
      id: 14,
      requesterId: 7,
      targetRole: { name: roleName.WAREHOUSE_STAFF },
    })
    expect(notificationEmitter.emitSafe).toHaveBeenCalledWith(
      NotificationEventName.ROLE_REQUEST_REVIEWED,
      expect.objectContaining({
        userId: 7,
        status: RoleRequestStatus.REJECTED,
      }),
    )
  })
})
