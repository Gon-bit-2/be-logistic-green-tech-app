import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import {
  CreateHubBodyType,
  GetAllHubsQueryType,
  GetHubAssignableUsersQueryType,
  UpdateHubBodyType,
} from 'src/modules/hub/model/hub.model'

/**
 * Repository for managing database queries of Logistic Hubs, staffing, and drivers via Prisma.
 * 
 * Kho lưu trữ quản lý các truy vấn cơ sở dữ liệu của các Kho trung chuyển, nhân sự và tài xế thông qua Prisma.
 */
@Injectable()
export class HubRepository {
  /**
   * Initializes the HubRepository.
   * 
   * Khởi tạo HubRepository.
   * 
   * @param prisma - Prisma service instance / Instance của dịch vụ Prisma.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new hub record in the database.
   * 
   * Tạo một bản ghi kho trung chuyển mới trong cơ sở dữ liệu.
   * 
   * @param data - Hub creation payload / Payload tạo mới kho.
   * @returns Created hub record / Bản ghi kho trung chuyển được tạo.
   */
  async create(data: CreateHubBodyType) {
    return await this.prisma.hub.create({ data })
  }

  /**
   * Retrieves all hubs with pagination and search functionality.
   * 
   * Lấy tất cả các kho trung chuyển có hỗ trợ phân trang và tìm kiếm.
   * 
   * @param query - Pagination and search query details / Chi tiết phân trang và tìm kiếm.
   * @returns Paginated result list and total count / Danh sách kết quả phân trang và tổng số lượng.
   */
  async findAll(query: GetAllHubsQueryType) {
    const { page, limit, search } = query
    const skip = (page - 1) * limit

    const where = {
      deletedAt: null,
      isActive: true,
      ...(search && {
        name: { contains: search, mode: 'insensitive' as const },
      }),
    }

    const [data, totalItems] = await Promise.all([
      this.prisma.hub.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.prisma.hub.count({ where }),
    ])

    return { data, totalItems }
  }

  /**
   * Finds a hub by ID and aggregates associated staff and driver members.
   * 
   * Tìm một kho trung chuyển theo ID và tổng hợp các nhân viên cũng như tài xế được liên kết.
   * 
   * @param id - Hub ID / ID kho.
   * @returns Hub details with nested lists of staff/drivers or null / Chi tiết kho kèm danh sách nhân viên/tài xế lồng nhau hoặc null.
   */
  async findById(id: number) {
    const hub = await this.prisma.hub.findUnique({
      where: { id },
      include: {
        _count: { select: { vehicles: true } },
      },
    })

    if (!hub) return null

    const members = await this.prisma.user.findMany({
      where: {
        hubId: id,
        deletedAt: null,
        isDeleted: false,
        role: { name: { in: ['WAREHOUSE_STAFF', 'DRIVER'] } },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        hubId: true,
        roleId: true,
        role: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
    })

    return {
      ...hub,
      staff: members.filter((member) => member.role.name === 'WAREHOUSE_STAFF'),
      drivers: members.filter((member) => member.role.name === 'DRIVER'),
    }
  }

  /**
   * Finds a hub by its unique code string.
   * 
   * Tìm một kho trung chuyển theo chuỗi mã kho duy nhất.
   * 
   * @param code - Hub code string / Chuỗi mã kho.
   * @returns Found hub or null / Kho trung chuyển được tìm thấy hoặc null.
   */
  async findByCode(code: string) {
    return await this.prisma.hub.findUnique({ where: { code } })
  }

  /**
   * Updates an existing hub record.
   * 
   * Cập nhật bản ghi một kho trung chuyển hiện có.
   * 
   * @param id - Hub ID / ID kho.
   * @param data - Updated fields / Các trường cần cập nhật.
   * @returns Updated hub record / Bản ghi kho trung chuyển đã cập nhật.
   */
  async update(id: number, data: UpdateHubBodyType) {
    return await this.prisma.hub.update({ where: { id }, data })
  }

  /**
   * Soft deletes a hub by setting active flag to false and adding timestamps.
   * 
   * Xóa mềm một kho bằng cách đặt cờ hoạt động thành false và thêm dấu thời gian.
   * 
   * @param id - Hub ID / ID kho.
   * @param deletedById - ID of the admin performing deletion / ID của admin thực hiện hành động xóa.
   * @returns Soft-deleted hub record / Bản ghi kho trung chuyển đã xóa mềm.
   */
  async delete(id: number, deletedById: number) {
    return await this.prisma.hub.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        deletedById,
      },
    })
  }

  /**
   * Assigns a warehouse staff member to a specific hub.
   * 
   * Gán một nhân viên kho vào một kho trung chuyển cụ thể.
   * 
   * @param hubId - Hub ID / ID kho.
   * @param userId - Staff user ID / ID người dùng của nhân viên.
   * @returns Updated user record / Bản ghi người dùng đã cập nhật.
   */
  async assignStaff(hubId: number, userId: number) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { hubId },
    })
  }

  /**
   * Removes a staff member's hub assignment.
   * 
   * Xóa liên kết kho trung chuyển của một nhân viên.
   * 
   * @param userId - Staff user ID / ID người dùng của nhân viên.
   * @returns Updated user record / Bản ghi người dùng đã cập nhật.
   */
  async removeStaff(userId: number) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { hubId: null },
    })
  }

  /**
   * Assigns a driver to a specific hub.
   * 
   * Gán một tài xế vào một kho trung chuyển cụ thể.
   * 
   * @param hubId - Hub ID / ID kho.
   * @param userId - Driver user ID / ID người dùng của tài xế.
   * @returns Updated user record / Bản ghi người dùng đã cập nhật.
   */
  async assignDriver(hubId: number, userId: number) {
    return await this.assignStaff(hubId, userId)
  }

  /**
   * Removes a driver's hub assignment.
   * 
   * Xóa liên kết kho trung chuyển của một tài xế.
   * 
   * @param userId - Driver user ID / ID người dùng của tài xế.
   * @returns Updated user record / Bản ghi người dùng đã cập nhật.
   */
  async removeDriver(userId: number) {
    return await this.removeStaff(userId)
  }

  /**
   * Lists all users eligible to be assigned to the hub.
   * Includes users currently unassigned or already assigned to this specific hub.
   * 
   * Liệt kê danh sách tất cả người dùng có thể được gán vào kho.
   * Bao gồm những người dùng hiện không được gán hoặc đã được gán vào chính kho này.
   * 
   * @param hubId - Hub ID / ID kho.
   * @param query - Filtering parameters / Các tham số lọc.
   * @returns Array of eligible user profiles / Mảng hồ sơ người dùng hợp lệ.
   */
  async findAssignableUsers(hubId: number, query: GetHubAssignableUsersQueryType) {
    const search = query.search?.trim()

    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isDeleted: false,
        role: { name: query.role },
        OR: [{ hubId }, { hubId: null }],
        ...(search
          ? {
              AND: [
                {
                  OR: [
                    { fullName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        hubId: true,
        role: { select: { name: true } },
      },
      orderBy: [{ hubId: 'desc' }, { fullName: 'asc' }, { id: 'asc' }],
      take: 100,
    })
  }
}
