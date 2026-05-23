import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { NotificationEmitterService } from 'src/common/services/notification-emitter.service'
import roleName from 'src/common/constants/role.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'
import { AuditLogService } from 'src/common/services/audit-log.service'
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

/**
 * Service for handling business logic of role requests.
 * Manages the creation of role requests, retrieving requests for users and admins,
 * and performing transactional approvals or rejections of role requests including updating user profiles,
 * emitting notification events, and writing audit logs.
 * 
 * Dịch vụ xử lý logic nghiệp vụ cho các yêu cầu vai trò.
 * Quản lý việc tạo yêu cầu vai trò, truy vấn yêu cầu cho người dùng và admin,
 * và thực hiện phê duyệt hoặc từ chối các yêu cầu theo transaction bao gồm cập nhật hồ sơ người dùng,
 * phát các sự kiện thông báo và ghi nhật ký kiểm toán (audit log).
 */
@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name)

  /**
   * Initializes the RoleService.
   * 
   * Khởi tạo RoleService.
   * 
   * @param roleRepository - Repository for role request DB operations / Repository cho thao tác DB yêu cầu vai trò.
   * @param authRepository - Repository for user account DB operations / Repository cho thao tác DB tài khoản người dùng.
   * @param notificationEmitter - Service to emit real-time notifications / Dịch vụ phát thông báo thời gian thực.
   * @param prismaService - Prisma service for database transactions / Dịch vụ Prisma để thực hiện transaction cơ sở dữ liệu.
   * @param auditLogService - Optional service to record system activity logs / Dịch vụ tùy chọn để ghi nhật ký hoạt động hệ thống.
   */
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly authRepository: AuthRepository,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly prismaService: PrismaService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  /**
   * Submits a new role upgrade request for a user.
   * Validates user existence, active status, role conflicts, and active pending requests.
   * Emits notification to administrators on successful submission.
   * 
   * Gửi một yêu cầu nâng cấp vai trò mới cho người dùng.
   * Xác thực sự tồn tại của người dùng, trạng thái hoạt động, xung đột vai trò và các yêu cầu chờ xử lý đang hoạt động.
   * Phát thông báo tới các admin khi gửi thành công.
   * 
   * @param userId - The ID of the user requesting the role / ID của người dùng yêu cầu vai trò.
   * @param body - The request body containing target role and requested hub / Dữ liệu yêu cầu chứa vai trò đích và hub được yêu cầu.
   * @returns The created role request details / Chi tiết yêu cầu vai trò vừa được tạo.
   * @throws NotFoundException - If user or hub does not exist / Nếu người dùng hoặc hub không tồn tại.
   * @throws BadRequestException - If admin attempts role change or user already has target role / Nếu admin cố gắng thay đổi vai trò hoặc người dùng đã có vai trò đích.
   * @throws ConflictException - If user already has a pending role request / Nếu người dùng đã có yêu cầu vai trò đang chờ xử lý.
   */
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

  /**
   * Retrieves role requests created by the active user with pagination and filters.
   * 
   * Lấy danh sách yêu cầu vai trò do chính người dùng hiện tại tạo với phân trang và bộ lọc.
   * 
   * @param userId - The active user's ID / ID của người dùng hiện tại.
   * @param query - Pagination and filter criteria / Các tiêu chí lọc và phân trang.
   * @returns A paginated list of role requests / Danh sách các yêu cầu vai trò có phân trang.
   */
  async findMine(userId: number, query: GetRoleRequestsQueryType) {
    return await this.roleRepository.findManyByRequester(userId, query)
  }

  /**
   * Retrieves all role requests in the system. Typically used by Admins.
   * 
   * Lấy danh sách tất cả các yêu cầu vai trò trong hệ thống. Thường dùng bởi Admin.
   * 
   * @param query - Pagination and filter criteria / Các tiêu chí lọc và phân trang.
   * @returns A paginated list of all role requests / Danh sách phân trang tất cả yêu cầu vai trò.
   */
  async findAll(query: GetRoleRequestsQueryType) {
    return await this.roleRepository.findMany(query)
  }

  /**
   * Approves a pending role request within a database transaction.
   * Updates the user's role and associated hub, marks request as approved,
   * records an audit log, and emits a notification to the requester.
   * 
   * Phê duyệt một yêu cầu vai trò đang chờ xử lý trong một transaction cơ sở dữ liệu.
   * Cập nhật vai trò người dùng và hub liên kết, đánh dấu yêu cầu là đã phê duyệt,
   * ghi audit log và phát thông báo đến người yêu cầu.
   * 
   * @param adminId - The ID of the admin reviewing the request / ID của admin đang xem xét yêu cầu.
   * @param id - The ID of the role request / ID của yêu cầu vai trò.
   * @param body - The approval request body containing optional hub assignment and review notes / Dữ liệu phê duyệt chứa gán hub tùy chọn và ghi chú xem xét.
   * @returns The updated role request details / Chi tiết yêu cầu vai trò sau khi cập nhật.
   * @throws NotFoundException - If the role request or target hub is not found / Nếu không tìm thấy yêu cầu vai trò hoặc hub mục tiêu.
   * @throws BadRequestException - If request is already processed or hub is missing for Warehouse Staff/Driver roles / Nếu yêu cầu đã được xử lý hoặc thiếu hub cho các vai trò Nhân viên kho/Tài xế.
   */
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

      const updated = await this.roleRepository.updateRoleRequest(
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
      await this.auditLogService?.record(
        {
          action: 'ROLE_REQUEST_APPROVED',
          actorUserId: adminId,
          after: { assignedHubId, status: RoleRequestStatus.APPROVED, targetRoleName: roleRequest.targetRole.name },
          before: { assignedHubId: roleRequest.assignedHubId, status: roleRequest.status },
          entityId: id,
          entityType: 'ROLE_REQUEST',
          metadata: { requesterId: roleRequest.requesterId },
        },
        tx,
      )
      return updated
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

  /**
   * Rejects a pending role request within a database transaction.
   * Marks request as rejected with review notes, records an audit log,
   * and emits a notification to the requester.
   * 
   * Từ chối một yêu cầu vai trò đang chờ xử lý trong một transaction cơ sở dữ liệu.
   * Đánh dấu yêu cầu là đã từ chối cùng ghi chú xem xét, ghi audit log và phát thông báo đến người yêu cầu.
   * 
   * @param adminId - The ID of the admin reviewing the request / ID của admin đang xem xét yêu cầu.
   * @param id - The ID of the role request / ID của yêu cầu vai trò.
   * @param body - The rejection request body containing review notes / Dữ liệu từ chối chứa ghi chú xem xét.
   * @returns The updated role request details / Chi tiết yêu cầu vai trò sau khi cập nhật.
   * @throws NotFoundException - If the role request is not found / Nếu không tìm thấy yêu cầu vai trò.
   * @throws BadRequestException - If request is already processed / Nếu yêu cầu đã được xử lý.
   */
  async reject(adminId: number, id: number, body: RejectRoleRequestBodyType) {
    const updatedRoleRequest = await this.prismaService.$transaction(async (tx) => {
      const roleRequest = await this.roleRepository.findById(id, tx)
      if (!roleRequest) {
        throw new NotFoundException('Không tìm thấy yêu cầu thay đổi vai trò')
      }

      if (roleRequest.status !== RoleRequestStatus.PENDING) {
        throw new BadRequestException('Yêu cầu này đã được xử lý')
      }

      const updated = await this.roleRepository.updateRoleRequest(
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
      await this.auditLogService?.record(
        {
          action: 'ROLE_REQUEST_REJECTED',
          actorUserId: adminId,
          after: { reviewNote: body.reviewNote, status: RoleRequestStatus.REJECTED },
          before: { assignedHubId: roleRequest.assignedHubId, status: roleRequest.status },
          entityId: id,
          entityType: 'ROLE_REQUEST',
          metadata: { requesterId: roleRequest.requesterId },
        },
        tx,
      )
      return updated
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
