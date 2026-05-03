import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { NotificationEmitterService } from 'src/common/services/notification-emitter.service'
import roleName from 'src/common/constants/role.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'
import {
  ApproveRoleRequestBodyType,
  CreateRoleRequestBodyType,
  GetRoleRequestsQueryType,
  RejectRoleRequestBodyType,
} from '../model/role.model'
import { RoleRepository } from '../repository/role.repo'
import {
  NotificationEventName,
  RoleRequestReviewedEvent,
  RoleRequestSubmittedEvent,
} from 'src/modules/notification/events/notification.event'

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name)

  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly authRepository: AuthRepository,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly prismaService: PrismaService,
  ) {}

  async create(userId: number, body: CreateRoleRequestBodyType) {
    const user = await this.authRepository.findUniqueIncludeRole({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name === roleName.ADMIN) {
      throw new BadRequestException('Admin không thể gửi yêu cầu thay đổi vai trò')
    }

    if (user.role.name === body.targetRoleName) {
      throw new BadRequestException('Bạn đã có vai trò này')
    }

    const pendingRequest = await this.roleRepository.findPendingByRequesterId(userId)
    if (pendingRequest) {
      throw new ConflictException('Bạn đang có một yêu cầu chờ xử lý')
    }

    const requestedHub = await this.roleRepository.findActiveHubById(body.hubId)
    if (!requestedHub) {
      throw new NotFoundException('Không tìm thấy hub hợp lệ để đăng ký vai trò')
    }

    const targetRoleId = await this.roleRepository.getRoleIdByName(body.targetRoleName)
    const createdRoleRequest = await this.roleRepository.createRoleRequest({
      requesterId: userId,
      currentRoleId: user.roleId,
      targetRoleId,
      reason: body.reason,
      assignedHubId: requestedHub.id,
    })

    const admins = await this.authRepository.findActiveAdmins()
    await this.notificationEmitter.emitSafe(NotificationEventName.ROLE_REQUEST_SUBMITTED, {
      recipientUserIds: admins.map((admin) => admin.id),
      requesterName: user.fullName,
      targetRoleName: body.targetRoleName,
      roleRequestId: createdRoleRequest.id,
    })

    return createdRoleRequest
  }

  async findMine(userId: number, query: GetRoleRequestsQueryType) {
    return await this.roleRepository.findManyByRequester(userId, query)
  }

  async findAll(query: GetRoleRequestsQueryType) {
    return await this.roleRepository.findMany(query)
  }

  async approve(adminId: number, id: number, body: ApproveRoleRequestBodyType) {
    const updatedRoleRequest = await this.prismaService.$transaction(async (tx) => {
      const roleRequest = await this.roleRepository.findById(id, tx)
      if (!roleRequest) {
        throw new NotFoundException('Không tìm thấy yêu cầu thay đổi vai trò')
      }

      if (roleRequest.status !== RoleRequestStatus.PENDING) {
        throw new BadRequestException('Yêu cầu này đã được xử lý')
      }

      let assignedHubId: number | null = null
      if (roleRequest.targetRole.name === roleName.WAREHOUSE_STAFF || roleRequest.targetRole.name === roleName.DRIVER) {
        const hubId = body.hubId ?? roleRequest.assignedHubId
        if (!hubId) {
          throw new BadRequestException(`Cần chọn hub khi duyệt vai trò ${roleRequest.targetRole.name}`)
        }

        const hub = await this.roleRepository.findActiveHubById(hubId, tx)
        if (!hub) {
          throw new NotFoundException(`Không tìm thấy hub hợp lệ để gán cho ${roleRequest.targetRole.name}`)
        }
        assignedHubId = hub.id
      }

      await this.roleRepository.updateUserRole(
        roleRequest.requesterId,
        {
          roleId: roleRequest.targetRoleId,
          hubId: assignedHubId,
        },
        tx,
      )

      return await this.roleRepository.updateRoleRequest(
        id,
        {
          status: RoleRequestStatus.APPROVED,
          reviewNote: body.reviewNote ?? null,
          reviewedById: adminId,
          reviewedAt: new Date(),
          assignedHubId,
        },
        tx,
      )
    })

    await this.notificationEmitter.emitSafe(NotificationEventName.ROLE_REQUEST_REVIEWED, {
      userId: updatedRoleRequest.requesterId,
      targetRoleName: updatedRoleRequest.targetRole.name as typeof roleName.DRIVER | typeof roleName.WAREHOUSE_STAFF,
      roleRequestId: updatedRoleRequest.id,
      status: RoleRequestStatus.APPROVED,
      reviewedById: adminId,
    })

    return updatedRoleRequest
  }

  async reject(adminId: number, id: number, body: RejectRoleRequestBodyType) {
    const updatedRoleRequest = await this.prismaService.$transaction(async (tx) => {
      const roleRequest = await this.roleRepository.findById(id, tx)
      if (!roleRequest) {
        throw new NotFoundException('Không tìm thấy yêu cầu thay đổi vai trò')
      }

      if (roleRequest.status !== RoleRequestStatus.PENDING) {
        throw new BadRequestException('Yêu cầu này đã được xử lý')
      }

      return await this.roleRepository.updateRoleRequest(
        id,
        {
          status: RoleRequestStatus.REJECTED,
          reviewNote: body.reviewNote,
          reviewedById: adminId,
          reviewedAt: new Date(),
          assignedHubId: null,
        },
        tx,
      )
    })

    await this.notificationEmitter.emitSafe(NotificationEventName.ROLE_REQUEST_REVIEWED, {
      userId: updatedRoleRequest.requesterId,
      targetRoleName: updatedRoleRequest.targetRole.name as typeof roleName.DRIVER | typeof roleName.WAREHOUSE_STAFF,
      roleRequestId: updatedRoleRequest.id,
      status: RoleRequestStatus.REJECTED,
      reviewedById: adminId,
    })

    return updatedRoleRequest
  }


}
