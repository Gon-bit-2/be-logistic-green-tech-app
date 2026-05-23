import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { IsAdmin } from 'src/common/decorators/roles.decorator'
import {
  AssignStaffBodyDTO,
  AssignDriverBodyDTO,
  CreateHubBodyDTO,
  GetAllHubsQueryDTO,
  GetAllHubsResDTO,
  GetHubAssignableUsersQueryDTO,
  HubDetailResDTO,
  UpdateHubBodyDTO,
} from 'src/modules/hub/dto/hub.dto'
import { HubService } from 'src/modules/hub/service/hub.service'
import { MessageResDTO } from 'src/common/dtos/response.dto'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'

/**
 * Controller for managing logistic hubs, staffing, and driver assignments.
 * 
 * Controller quản lý các kho bãi trung chuyển, nhân viên và phân phối tài xế.
 */
@Controller('hubs')
export class HubController {
  /**
   * Initializes the HubController.
   * 
   * Khởi tạo HubController.
   * 
   * @param hubService - The Hub service instance / Instance của dịch vụ Hub.
   */
  constructor(private readonly hubService: HubService) {}

  /**
   * Creates a new logistic hub.
   * Only accessible by Admin.
   * 
   * Tạo một kho trung chuyển mới.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param body - Hub creation data / Dữ liệu tạo mới kho trung chuyển.
   * @returns Details of the newly created hub / Chi tiết kho trung chuyển vừa được tạo.
   */
  @Post()
  @IsAdmin()
  @ZodSerializerDto(HubDetailResDTO)
  create(@Body() body: CreateHubBodyDTO) {
    return this.hubService.create(body)
  }

  /**
   * Retrieves all hubs with pagination and optional search filter.
   * 
   * Lấy danh sách tất cả các kho trung chuyển với phân trang và bộ lọc tìm kiếm tùy chọn.
   * 
   * @param query - Pagination and search query details / Chi tiết phân trang và truy vấn tìm kiếm.
   * @returns Paginated list of hubs / Danh sách kho trung chuyển được phân trang.
   */
  @Get()
  @ZodSerializerDto(GetAllHubsResDTO)
  findAll(@Query() query: GetAllHubsQueryDTO) {
    return this.hubService.findAll(query)
  }

  /**
   * Retrieves a list of users (staff/drivers) assignable to a specific hub.
   * Only accessible by Admin.
   * 
   * Lấy danh sách người dùng (nhân viên/tài xế) có thể gán vào một kho trung chuyển cụ thể.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Hub ID / ID kho trung chuyển.
   * @param query - Filters for assignable users / Bộ lọc người dùng có thể gán.
   * @returns List of assignable users / Danh sách người dùng có thể gán.
   */
  @Get(':id/assignable-users')
  @IsAdmin()
  findAssignableUsers(@Param('id', ParseIntPipe) id: number, @Query() query: GetHubAssignableUsersQueryDTO) {
    return this.hubService.findAssignableUsers(id, query)
  }

  /**
   * Retrieves details of a specific hub by ID.
   * 
   * Lấy thông tin chi tiết của một kho trung chuyển cụ thể theo ID.
   * 
   * @param id - Hub ID / ID kho trung chuyển.
   * @returns Detail info of the hub / Thông tin chi tiết của kho trung chuyển.
   */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.hubService.findById(id)
  }

  /**
   * Updates details of an existing hub.
   * Only accessible by Admin.
   * 
   * Cập nhật thông tin chi tiết của một kho trung chuyển hiện có.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Hub ID / ID kho trung chuyển.
   * @param body - Updated fields data / Dữ liệu các trường cần cập nhật.
   * @returns Updated hub details / Chi tiết kho trung chuyển sau khi cập nhật.
   */
  @Patch(':id')
  @IsAdmin()
  @ZodSerializerDto(HubDetailResDTO)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateHubBodyDTO) {
    return this.hubService.update(id, body)
  }

  /**
   * Deletes a hub by ID.
   * Only accessible by Admin.
   * 
   * Xóa một kho trung chuyển theo ID.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Hub ID to delete / ID kho trung chuyển cần xóa.
   * @param userId - ID of the active admin performing the deletion / ID của admin đang thực hiện hành động xóa.
   * @returns Success message / Thông điệp thành công.
   */
  @Delete(':id')
  @IsAdmin()
  @ZodSerializerDto(MessageResDTO)
  async remove(@Param('id', ParseIntPipe) id: number, @ActiveUser('userId') userId: number) {
    await this.hubService.delete(id, userId)
    return { message: 'Xóa kho trung chuyển thành công' }
  }

  /**
   * Assigns a staff member to a specific hub.
   * Only accessible by Admin.
   * 
   * Gán một nhân viên vào một kho trung chuyển cụ thể.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Hub ID / ID kho trung chuyển.
   * @param body - Request body containing the target user ID / Body chứa ID người dùng đích.
   * @returns Assignment detail results / Kết quả chi tiết lượt gán.
   */
  @Post(':id/staff')
  @IsAdmin()
  assignStaff(@Param('id', ParseIntPipe) id: number, @Body() body: AssignStaffBodyDTO) {
    return this.hubService.assignStaff(id, body.userId)
  }

  /**
   * Removes a staff member from a specific hub.
   * Only accessible by Admin.
   * 
   * Xóa một nhân viên khỏi một kho trung chuyển cụ thể.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Hub ID / ID kho trung chuyển.
   * @param userId - Target User ID to remove / ID người dùng đích cần xóa.
   * @returns Success message / Thông điệp thành công.
   */
  @Delete(':id/staff/:userId')
  @IsAdmin()
  @ZodSerializerDto(MessageResDTO)
  async removeStaff(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    await this.hubService.removeStaff(id, userId)
    return { message: 'Xoá nhân viên khỏi kho trung chuyển thành công' }
  }

  /**
   * Assigns a driver to a specific hub.
   * Only accessible by Admin.
   * 
   * Gán một tài xế vào một kho trung chuyển cụ thể.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Hub ID / ID kho trung chuyển.
   * @param body - Request body containing the target driver user ID / Body chứa ID tài xế đích.
   * @returns Assignment detail results / Kết quả chi tiết lượt gán.
   */
  @Post(':id/drivers')
  @IsAdmin()
  assignDriver(@Param('id', ParseIntPipe) id: number, @Body() body: AssignDriverBodyDTO) {
    return this.hubService.assignDriver(id, body.userId)
  }

  /**
   * Removes a driver from a specific hub.
   * Only accessible by Admin.
   * 
   * Xóa một tài xế khỏi một kho trung chuyển cụ thể.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Hub ID / ID kho trung chuyển.
   * @param userId - Target Driver User ID to remove / ID tài xế đích cần xóa.
   * @returns Success message / Thông điệp thành công.
   */
  @Delete(':id/drivers/:userId')
  @IsAdmin()
  @ZodSerializerDto(MessageResDTO)
  async removeDriver(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    await this.hubService.removeDriver(id, userId)
    return { message: 'Xoá tài xế khỏi kho trung chuyển thành công' }
  }
}
