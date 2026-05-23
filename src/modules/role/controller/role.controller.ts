import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { IsAdmin, Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { RoleService } from '../service/role.service'
import {
  ApproveRoleRequestBodyDTO,
  CreateRoleRequestBodyDTO,
  GetRoleRequestsQueryDTO,
  GetRoleRequestsResDTO,
  RejectRoleRequestBodyDTO,
  RoleRequestItemDTO,
} from '../dto/role.dto'

/**
 * Controller for managing role upgrade and assignment requests.
 * Handles operations where users (Drivers, Customers, Warehouse Staff) request role changes,
 * and administrators approve or reject these requests.
 * 
 * Controller quản lý các yêu cầu nâng cấp và phân bổ vai trò (role).
 * Xử lý các thao tác nơi người dùng (Tài xế, Khách hàng, Nhân viên kho) yêu cầu thay đổi vai trò,
 * và quản trị viên phê duyệt hoặc từ chối các yêu cầu này.
 */
@Controller('role-requests')
export class RoleController {
  /**
   * Initializes the RoleController.
   * 
   * Khởi tạo RoleController.
   * 
   * @param roleService - The Role service instance / Instance của dịch vụ vai trò.
   */
  constructor(private readonly roleService: RoleService) {}

  /**
   * Creates a new role request for the active user.
   * Only accessible by users with CUSTOMER, DRIVER, or WAREHOUSE_STAFF roles.
   * 
   * Tạo một yêu cầu thay đổi vai trò mới cho người dùng hiện tại.
   * Chỉ có thể truy cập bởi người dùng có vai trò KHÁCH HÀNG, TÀI XẾ hoặc NHÂN VIÊN KHO.
   * 
   * @param userId - The ID of the user requesting the role change / ID của người dùng yêu cầu thay đổi vai trò.
   * @param body - The request body containing details for the new role / Dữ liệu yêu cầu chứa thông tin chi tiết về vai trò mới.
   * @returns The details of the created role request / Chi tiết của yêu cầu thay đổi vai trò vừa tạo.
   */
  @Post()
  @Roles(roleName.CUSTOMER, roleName.DRIVER, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(RoleRequestItemDTO)
  create(@ActiveUser('userId') userId: number, @Body() body: CreateRoleRequestBodyDTO) {
    return this.roleService.create(userId, body)
  }

  /**
   * Retrieves role requests created by the active user.
   * Only accessible by users with CUSTOMER, DRIVER, or WAREHOUSE_STAFF roles.
   * 
   * Lấy danh sách các yêu cầu thay đổi vai trò do chính người dùng hiện tại tạo ra.
   * Chỉ có thể truy cập bởi người dùng có vai trò KHÁCH HÀNG, TÀI XẾ hoặc NHÂN VIÊN KHO.
   * 
   * @param userId - The active user's ID / ID của người dùng hiện tại.
   * @param query - Pagination and filtering parameters / Các tham số phân trang và bộ lọc.
   * @returns List of role requests made by the user / Danh sách yêu cầu thay đổi vai trò của người dùng.
   */
  @Get('me')
  @Roles(roleName.CUSTOMER, roleName.DRIVER, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(GetRoleRequestsResDTO)
  findMine(@ActiveUser('userId') userId: number, @Query() query: GetRoleRequestsQueryDTO) {
    return this.roleService.findMine(userId, query)
  }

  /**
   * Retrieves all role requests in the system.
   * Only accessible by Admin users.
   * 
   * Lấy danh sách tất cả các yêu cầu thay đổi vai trò trong hệ thống.
   * Chỉ dành cho quản trị viên (Admin).
   * 
   * @param query - Pagination and filtering parameters / Các tham số phân trang và bộ lọc.
   * @returns A paginated list of role requests / Danh sách các yêu cầu thay đổi vai trò có phân trang.
   */
  @Get()
  @IsAdmin()
  @ZodSerializerDto(GetRoleRequestsResDTO)
  findAll(@Query() query: GetRoleRequestsQueryDTO) {
    return this.roleService.findAll(query)
  }

  /**
   * Approves a role request.
   * Only accessible by Admin users.
   * 
   * Phê duyệt một yêu cầu thay đổi vai trò.
   * Chỉ dành cho quản trị viên (Admin).
   * 
   * @param adminId - The ID of the admin approving the request / ID của admin phê duyệt yêu cầu.
   * @param id - The ID of the role request / ID của yêu cầu thay đổi vai trò.
   * @param body - Approval details (e.g., notes) / Thông tin chi tiết phê duyệt (ví dụ: ghi chú).
   * @returns The updated role request details / Chi tiết yêu cầu thay đổi vai trò sau khi cập nhật.
   */
  @Patch(':id/approve')
  @IsAdmin()
  @ZodSerializerDto(RoleRequestItemDTO)
  approve(
    @ActiveUser('userId') adminId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveRoleRequestBodyDTO,
  ) {
    return this.roleService.approve(adminId, id, body)
  }

  /**
   * Rejects a role request.
   * Only accessible by Admin users.
   * 
   * Từ chối một yêu cầu thay đổi vai trò.
   * Chỉ dành cho quản trị viên (Admin).
   * 
   * @param adminId - The ID of the admin rejecting the request / ID của admin từ chối yêu cầu.
   * @param id - The ID of the role request / ID của yêu cầu thay đổi vai trò.
   * @param body - Reason for rejection / Lý do từ chối.
   * @returns The updated role request details / Chi tiết yêu cầu thay đổi vai trò sau khi cập nhật.
   */
  @Patch(':id/reject')
  @IsAdmin()
  @ZodSerializerDto(RoleRequestItemDTO)
  reject(
    @ActiveUser('userId') adminId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectRoleRequestBodyDTO,
  ) {
    return this.roleService.reject(adminId, id, body)
  }
}
