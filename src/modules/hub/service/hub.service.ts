import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  CreateHubBodyType,
  GetAllHubsQueryType,
  GetHubAssignableUsersQueryType,
  UpdateHubBodyType,
} from 'src/modules/hub/model/hub.model'
import { HubRepository } from 'src/modules/hub/repository/hub.repo'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import roleName from 'src/common/constants/role.constant'

/**
 * Service handling core business logic for managing logistic hubs, staffing, and driver operations.
 *
 * Dịch vụ xử lý logic nghiệp vụ cốt lõi để quản lý kho trung chuyển, phân bổ nhân viên và tài xế.
 */
@Injectable()
export class HubService {
  /**
   * Initializes the HubService.
   *
   * Khởi tạo HubService.
   *
   * @param hubRepo - Repository handling Hub database operations / Repository xử lý các thao tác DB của Hub.
   * @param authRepository - Repository handling User database operations / Repository xử lý các thao tác DB của Người dùng.
   */
  constructor(
    private readonly hubRepo: HubRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  /**
   * Creates a new hub in the system. Checks if the hub code already exists.
   *
   * Tạo một kho trung chuyển mới trong hệ thống. Kiểm tra mã kho đã tồn tại chưa.
   *
   * @param data - Hub creation payload / Payload tạo mới kho.
   * @returns Newly created hub details / Chi tiết kho vừa được tạo mới.
   * @throws ConflictException if the hub code is already in use / ConflictException nếu mã kho đã được sử dụng.
   */
  async create(data: CreateHubBodyType) {
    const existing = await this.hubRepo.findByCode(data.code)
    if (existing) {
      throw new ConflictException('Mã kho đã tồn tại trong hệ thống')
    }
    return this.hubRepo.create(data)
  }

  /**
   * Finds all hubs matching the pagination and filter criteria.
   *
   * Tìm tất cả các kho trung chuyển khớp với tiêu chí phân trang và bộ lọc.
   *
   * @param query - Search parameters / Tham số tìm kiếm.
   * @returns Paginated list of hubs / Danh sách kho trung chuyển được phân trang.
   */
  async findAll(query: GetAllHubsQueryType) {
    return this.hubRepo.findAll(query)
  }

  /**
   * Finds a hub by its unique ID. Throws NotFoundException if it doesn't exist.
   *
   * Tìm một kho trung chuyển theo ID duy nhất. Ném ra NotFoundException nếu không tồn tại.
   *
   * @param id - Hub ID / ID kho.
   * @returns Found hub entity / Thực thể kho trung chuyển tìm thấy.
   * @throws NotFoundException if the hub is not found / NotFoundException nếu không tìm thấy kho.
   */
  async findById(id: number) {
    const hub = await this.hubRepo.findById(id)
    if (!hub) {
      throw new NotFoundException('Không tìm thấy kho trung chuyển')
    }
    return hub
  }

  /**
   * Updates an existing hub's details. Validates uniqueness of the new code if provided.
   *
   * Cập nhật thông tin chi tiết của một kho trung chuyển hiện có. Xác thực tính duy nhất của mã mới nếu được truyền vào.
   *
   * @param id - Hub ID / ID kho.
   * @param data - Hub updates payload / Payload thông tin cập nhật kho.
   * @returns Updated hub details / Chi tiết kho sau khi cập nhật.
   * @throws ConflictException if the new code is already in use by another hub / ConflictException nếu mã mới đã được sử dụng bởi kho khác.
   */
  async update(id: number, data: UpdateHubBodyType) {
    await this.findById(id)

    if (data.code) {
      const existing = await this.hubRepo.findByCode(data.code)
      if (existing && existing.id !== id) {
        throw new ConflictException('Mã kho đã tồn tại trong hệ thống')
      }
    }

    return this.hubRepo.update(id, data)
  }

  /**
   * Deletes a hub soft-deleted or hard-deleted based on repository implementation.
   *
   * Xóa một kho trung chuyển (xóa mềm hoặc xóa cứng tùy thuộc vào implement của repository).
   *
   * @param id - Hub ID / ID kho.
   * @param deletedById - ID of the user performing deletion / ID của người thực hiện hành động xóa.
   * @returns Deletion status results / Kết quả trạng thái xóa.
   */
  async delete(id: number, deletedById: number) {
    await this.findById(id)
    return this.hubRepo.delete(id, deletedById)
  }

  /**
   * Assigns a warehouse staff member to a hub. Validates existence and roles.
   *
   * Gán một nhân viên kho vào một kho trung chuyển. Xác thực sự tồn tại của người dùng và vai trò phù hợp.
   *
   * @param hubId - Hub ID / ID kho.
   * @param userId - User ID of the warehouse staff / ID người dùng của nhân viên kho.
   * @returns Updated hub user details / Chi tiết phân bổ người dùng kho.
   * @throws NotFoundException if user is not found / NotFoundException nếu không tìm thấy người dùng.
   * @throws BadRequestException if the user does not have WAREHOUSE_STAFF role / BadRequestException nếu người dùng không có vai trò WAREHOUSE_STAFF.
   */
  async assignStaff(hubId: number, userId: number) {
    await this.findById(hubId)

    const user = await this.authRepository.findUniqueIncludeRolePermissions({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name !== roleName.WAREHOUSE_STAFF) {
      throw new BadRequestException('Chỉ có thể gán nhân viên có vai trò WAREHOUSE_STAFF vào kho')
    }

    return this.hubRepo.assignStaff(hubId, userId)
  }

  /**
   * Removes a staff member from their assigned hub. Validates status and assignment.
   *
   * Xóa một nhân viên khỏi kho trung chuyển được gán của họ. Xác thực trạng thái và lượt gán hiện tại.
   *
   * @param hubId - Hub ID / ID kho.
   * @param userId - Staff user ID / ID người dùng của nhân viên.
   * @returns Database response for removal / Phản hồi cơ sở dữ liệu khi xóa.
   * @throws NotFoundException if user is not found / NotFoundException nếu không tìm thấy người dùng.
   * @throws BadRequestException if role is mismatched or staff is not assigned to this hub / BadRequestException nếu vai trò không khớp hoặc nhân viên không thuộc kho này.
   */
  async removeStaff(hubId: number, userId: number) {
    await this.findById(hubId)

    const user = await this.authRepository.findUniqueIncludeRolePermissions({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name !== roleName.WAREHOUSE_STAFF) {
      throw new BadRequestException('Chỉ có thể xoá nhân viên có vai trò WAREHOUSE_STAFF khỏi kho')
    }

    if (user.hubId !== hubId) {
      throw new BadRequestException('Nhân viên này không thuộc kho trung chuyển đã chọn')
    }

    return this.hubRepo.removeStaff(userId)
  }

  /**
   * Assigns a driver to a hub. Validates existence and roles.
   *
   * Gán một tài xế vào một kho trung chuyển. Xác thực sự tồn tại và vai trò tài xế.
   *
   * @param hubId - Hub ID / ID kho.
   * @param userId - Driver user ID / ID người dùng của tài xế.
   * @returns Updated driver user details / Chi tiết phân bổ tài xế.
   * @throws NotFoundException if driver is not found / NotFoundException nếu không tìm thấy tài xế.
   * @throws BadRequestException if user is not a DRIVER / BadRequestException nếu người dùng không phải tài xế.
   */
  async assignDriver(hubId: number, userId: number) {
    await this.findById(hubId)

    const user = await this.authRepository.findUniqueIncludeRolePermissions({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name !== roleName.DRIVER) {
      throw new BadRequestException('Chỉ có thể gán tài xế có vai trò DRIVER vào kho')
    }

    return this.hubRepo.assignDriver(hubId, userId)
  }

  /**
   * Removes a driver from their assigned hub. Validates assignment status.
   *
   * Xóa một tài xế khỏi kho trung chuyển được gán của họ. Xác thực trạng thái phân bổ.
   *
   * @param hubId - Hub ID / ID kho.
   * @param userId - Driver user ID / ID người dùng của tài xế.
   * @returns Database response for driver removal / Phản hồi cơ sở dữ liệu khi xóa tài xế.
   * @throws NotFoundException if driver is not found / NotFoundException nếu không tìm thấy tài xế.
   * @throws BadRequestException if role is mismatched or driver not assigned to this hub / BadRequestException nếu vai trò không khớp hoặc tài xế không thuộc kho này.
   */
  async removeDriver(hubId: number, userId: number) {
    await this.findById(hubId)

    const user = await this.authRepository.findUniqueIncludeRolePermissions({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name !== roleName.DRIVER) {
      throw new BadRequestException('Chỉ có thể xoá tài xế có vai trò DRIVER khỏi kho')
    }

    if (user.hubId !== hubId) {
      throw new BadRequestException('Tài xế này không thuộc kho trung chuyển đã chọn')
    }

    return this.hubRepo.removeDriver(userId)
  }

  /**
   * Lists all users eligible for assignment to the hub.
   *
   * Liệt kê danh sách tất cả người dùng đủ điều kiện để gán vào kho.
   *
   * @param hubId - Hub ID / ID kho.
   * @param query - Pagination and filtering settings / Các thiết lập bộ lọc và phân trang.
   * @returns List of assignable users / Danh sách người dùng có thể gán.
   */
  async findAssignableUsers(hubId: number, query: GetHubAssignableUsersQueryType) {
    await this.findById(hubId)
    return this.hubRepo.findAssignableUsers(hubId, query)
  }
}
