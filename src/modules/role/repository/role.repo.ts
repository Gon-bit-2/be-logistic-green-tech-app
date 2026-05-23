import { Injectable } from '@nestjs/common'
import { Prisma, RoleRequestStatus } from 'generated/prisma'
import roleName from 'src/common/constants/role.constant'
import { PrismaService } from 'src/database/prisma.service'
import { GetRoleRequestsQueryType, RoleType } from '../model/role.model'

type PrismaExecutor = PrismaService | Prisma.TransactionClient

const roleRequestDetailInclude = {
  requester: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      hubId: true,
    },
  },
  currentRole: {
    select: {
      id: true,
      name: true,
    },
  },
  targetRole: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedHub: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.RoleRequestInclude

/**
 * Repository class for performing database operations related to User Roles and Role Requests.
 * Directly interacts with Prisma, manages role caches, and supports transactional execution.
 * 
 * Lớp Repository để thực hiện các thao tác cơ sở dữ liệu liên quan đến Vai trò người dùng và Yêu cầu vai trò.
 * Tương tác trực tiếp với Prisma, quản lý bộ nhớ đệm role và hỗ trợ thực thi transaction.
 */
@Injectable()
export class RoleRepository {
  private readonly roleIdCache = new Map<string, number>()

  /**
   * Initializes the RoleRepository.
   * 
   * Khởi tạo RoleRepository.
   * 
   * @param prisma - The Prisma service instance / Instance của dịch vụ Prisma.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the appropriate Prisma executor client (standard or transactional).
   * 
   * Xác định client thực thi Prisma thích hợp (tiêu chuẩn hoặc transactional).
   * 
   * @param client - Optional transactional client / Client transactional tùy chọn.
   * @returns Prisma client / Prisma client thực thi.
   */
  private getClient(client?: PrismaExecutor) {
    return client ?? this.prisma
  }

  /**
   * Queries the role entity by its name from database.
   * 
   * Truy vấn thực thể vai trò theo tên từ cơ sở dữ liệu.
   * 
   * @param name - The role name / Tên của vai trò.
   * @returns The role details / Thông tin chi tiết vai trò.
   * @throws Error - If role is not found / Nếu không tìm thấy vai trò.
   */
  private async getRole(name: string) {
    const role: RoleType = await this.prisma.$queryRaw<
      RoleType[]
    >`SELECT * FROM "roles" WHERE name=${name} AND "deletedAt" IS NULL LIMIT 1`.then((res) => {
      if (res.length === 0) {
        throw new Error('Role not found')
      }
      return res[0]
    })
    return role
  }

  /**
   * Resolves role ID by its name, utilizing internal cache.
   * 
   * Xác định ID vai trò theo tên, sử dụng bộ nhớ đệm nội bộ.
   * 
   * @param name - The role name / Tên của vai trò.
   * @returns The role ID / ID của vai trò.
   */
  async getRoleIdByName(name: string) {
    const cachedRoleId = this.roleIdCache.get(name)
    if (cachedRoleId) {
      return cachedRoleId
    }

    const role = await this.getRole(name)
    this.roleIdCache.set(name, role.id)
    return role.id
  }

  /**
   * Retrieves the customer role ID.
   * 
   * Lấy ID vai trò của khách hàng.
   * 
   * @returns Customer role ID / ID vai trò của khách hàng.
   */
  async getClientRoleId() {
    return this.getRoleIdByName(roleName.CUSTOMER)
  }

  /**
   * Retrieves the administrator role ID.
   * 
   * Lấy ID vai trò của quản trị viên.
   * 
   * @returns Administrator role ID / ID vai trò của quản trị viên.
   */
  async getAdminRoleId() {
    return this.getRoleIdByName(roleName.ADMIN)
  }

  /**
   * Retrieves the driver role ID.
   * 
   * Lấy ID vai trò của tài xế.
   * 
   * @returns Driver role ID / ID vai trò của tài xế.
   */
  async getDriverRoleId() {
    return this.getRoleIdByName(roleName.DRIVER)
  }

  /**
   * Retrieves the warehouse staff role ID.
   * 
   * Lấy ID vai trò của nhân viên kho.
   * 
   * @returns Warehouse staff role ID / ID vai trò của nhân viên kho.
   */
  async getWarehouseStaffRoleId() {
    return this.getRoleIdByName(roleName.WAREHOUSE_STAFF)
  }

  /**
   * Checks if a user has a pending role request.
   * 
   * Kiểm tra xem người dùng có yêu cầu vai trò đang chờ xử lý hay không.
   * 
   * @param requesterId - The user ID / ID người dùng.
   * @returns The pending request or null / Yêu cầu chờ xử lý hoặc null.
   */
  async findPendingByRequesterId(requesterId: number) {
    return await this.prisma.roleRequest.findFirst({
      where: {
        requesterId,
        status: RoleRequestStatus.PENDING,
      },
    })
  }

  /**
   * Creates a new role upgrade request in the database.
   * 
   * Tạo một yêu cầu nâng cấp vai trò mới trong cơ sở dữ liệu.
   * 
   * @param data - The role request creation details / Thông tin chi tiết tạo yêu cầu vai trò.
   * @param client - Optional transactional client / Client transactional tùy chọn.
   * @returns The created role request details / Chi tiết yêu cầu vai trò được tạo.
   */
  async createRoleRequest(
    data: {
      requesterId: number
      currentRoleId: number
      targetRoleId: number
      reason: string
      assignedHubId: number
    },
    client?: PrismaExecutor,
  ) {
    return await this.getClient(client).roleRequest.create({
      data,
      include: roleRequestDetailInclude,
    })
  }

  /**
   * Retrieves a role request by its unique ID.
   * 
   * Lấy một yêu cầu vai trò theo ID duy nhất.
   * 
   * @param id - The role request ID / ID của yêu cầu vai trò.
   * @param client - Optional transactional client / Client transactional tùy chọn.
   * @returns The role request or null / Yêu cầu vai trò hoặc null.
   */
  async findById(id: number, client?: PrismaExecutor) {
    return await this.getClient(client).roleRequest.findUnique({
      where: { id },
      include: roleRequestDetailInclude,
    })
  }

  /**
   * Retrieves role requests created by a specific user with pagination and status filters.
   * 
   * Lấy các yêu cầu vai trò được tạo bởi một người dùng cụ thể với phân trang và bộ lọc trạng thái.
   * 
   * @param requesterId - The requester user ID / ID người dùng yêu cầu.
   * @param query - Pagination and filtering parameters / Các tham số phân trang và bộ lọc.
   * @returns A promise resolving to list of requests and total count / Một promise chứa danh sách yêu cầu và tổng số lượng.
   */
  async findManyByRequester(requesterId: number, query: GetRoleRequestsQueryType) {
    const { page, limit, status, targetRoleName } = query
    const skip = (page - 1) * limit
    const where: Prisma.RoleRequestWhereInput = {
      requesterId,
      ...(status ? { status } : {}),
      ...(targetRoleName ? { targetRole: { name: targetRoleName } } : {}),
    }

    const [data, totalItems] = await Promise.all([
      this.prisma.roleRequest.findMany({
        where,
        include: roleRequestDetailInclude,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.roleRequest.count({ where }),
    ])

    return { data, totalItems }
  }

  /**
   * Retrieves all role requests in the system with pagination and filters (typically for Admins).
   * 
   * Lấy tất cả các yêu cầu vai trò trong hệ thống với phân trang và bộ lọc (thường dành cho Admin).
   * 
   * @param query - Pagination and filtering parameters / Các tham số phân trang và bộ lọc.
   * @returns A promise resolving to list of requests and total count / Một promise chứa danh sách yêu cầu và tổng số lượng.
   */
  async findMany(query: GetRoleRequestsQueryType) {
    const { page, limit, status, targetRoleName } = query
    const skip = (page - 1) * limit
    const where: Prisma.RoleRequestWhereInput = {
      ...(status ? { status } : {}),
      ...(targetRoleName ? { targetRole: { name: targetRoleName } } : {}),
    }

    const [data, totalItems] = await Promise.all([
      this.prisma.roleRequest.findMany({
        where,
        include: roleRequestDetailInclude,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.roleRequest.count({ where }),
    ])

    return { data, totalItems }
  }

  /**
   * Updates an existing role request.
   * 
   * Cập nhật một yêu cầu vai trò hiện có.
   * 
   * @param id - The role request ID / ID của yêu cầu vai trò.
   * @param data - The data fields to update / Các trường dữ liệu cần cập nhật.
   * @param client - Optional transactional client / Client transactional tùy chọn.
   * @returns The updated role request details / Chi tiết yêu cầu vai trò sau khi cập nhật.
   */
  async updateRoleRequest(
    id: number,
    data: Prisma.RoleRequestUpdateInput | Prisma.RoleRequestUncheckedUpdateInput,
    client?: PrismaExecutor,
  ) {
    return await this.getClient(client).roleRequest.update({
      where: { id },
      data,
      include: roleRequestDetailInclude,
    })
  }

  /**
   * Updates a user's role and associated hub in the database.
   * 
   * Cập nhật vai trò và hub liên kết của người dùng trong cơ sở dữ liệu.
   * 
   * @param userId - The user ID to update / ID người dùng cần cập nhật.
   * @param data - The new role ID and optional hub ID / ID vai trò mới và ID hub tùy chọn.
   * @param client - Optional transactional client / Client transactional tùy chọn.
   * @returns The updated user details / Chi tiết người dùng sau khi cập nhật.
   */
  async updateUserRole(
    userId: number,
    data: {
      roleId: number
      hubId: number | null
    },
    client?: PrismaExecutor,
  ) {
    return await this.getClient(client).user.update({
      where: {
        id: userId,
      },
      data: {
        roleId: data.roleId,
        hubId: data.hubId,
      },
    })
  }

  /**
   * Verifies and retrieves an active hub by its ID.
   * 
   * Xác minh và lấy một hub đang hoạt động bằng ID của nó.
   * 
   * @param id - The hub ID / ID của hub.
   * @param client - Optional transactional client / Client transactional tùy chọn.
   * @returns Hub detail with its ID or null / Thông tin hub với ID của nó hoặc null.
   */
  async findActiveHubById(id: number, client?: PrismaExecutor) {
    return await this.getClient(client).hub.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
      },
    })
  }
}
