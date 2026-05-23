import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '@src/common/decorators/active-user.decorator'
import { IsAdmin } from '@src/common/decorators/roles.decorator'
import {
  CreateVehicleBodyDTO,
  GetAllVehiclesQueryDTO,
  GetAllVehiclesResDTO,
  GetVehicleDetailResDTO,
  UpdateVehicleBodyDTO,
} from 'src/modules/vehicle/dto/vehicle.dto'
import { VehicleService } from 'src/modules/vehicle/service/vehicle.service'

/**
 * Controller for managing logistic vehicles (EV/electric, hybrid, internal combustion).
 * Only accessible by Admin users.
 * 
 * Controller quản lý các phương tiện vận chuyển (xe điện, hybrid, xe động cơ đốt trong).
 * Chỉ có thể truy cập bởi tài khoản Admin.
 */
@Controller('vehicles')
export class VehicleController {
  /**
   * Initializes the VehicleController.
   * 
   * Khởi tạo VehicleController.
   * 
   * @param vehicleService - The Vehicle service instance / Instance của dịch vụ phương tiện.
   */
  constructor(private readonly vehicleService: VehicleService) {}

  /**
   * Creates a new vehicle record in the system.
   * Only accessible by Admin.
   * 
   * Tạo một bản ghi phương tiện vận chuyển mới trong hệ thống.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param body - Vehicle creation payload / Payload tạo mới phương tiện.
   * @param userId - ID of the active admin performing creation / ID của admin thực hiện hành động tạo.
   * @returns Detailed info of the newly created vehicle / Thông tin chi tiết phương tiện vừa tạo.
   */
  @Post()
  @IsAdmin()
  @ZodSerializerDto(GetVehicleDetailResDTO)
  create(@Body() body: CreateVehicleBodyDTO, @ActiveUser('userId') userId: number) {
    return this.vehicleService.create(userId, body)
  }

  /**
   * Retrieves all vehicles matching pagination and filter criteria.
   * Only accessible by Admin.
   * 
   * Lấy tất cả phương tiện khớp với tiêu chí phân trang và bộ lọc.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param query - Filtering and pagination parameters / Các bộ lọc và tham số phân trang.
   * @returns Paginated list of vehicles / Danh sách phương tiện phân trang.
   */
  @Get()
  @IsAdmin()
  @ZodSerializerDto(GetAllVehiclesResDTO)
  findAll(@Query() query: GetAllVehiclesQueryDTO) {
    return this.vehicleService.findAll(query)
  }

  /**
   * Retrieves details of a specific vehicle by ID.
   * Only accessible by Admin.
   * 
   * Lấy chi tiết thông tin phương tiện cụ thể theo ID.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Vehicle ID / ID phương tiện.
   * @returns Detail info of the vehicle / Thông tin chi tiết phương tiện.
   */
  @Get(':id')
  @IsAdmin()
  @ZodSerializerDto(GetVehicleDetailResDTO)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vehicleService.findById(id)
  }

  /**
   * Updates details of an existing vehicle.
   * Only accessible by Admin.
   * 
   * Cập nhật thông tin chi tiết phương tiện hiện có.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Vehicle ID / ID phương tiện.
   * @param updateVehicleDto - Vehicle updates data / Dữ liệu các trường cần cập nhật.
   * @param userId - ID of the active admin performing update / ID của admin thực hiện cập nhật.
   * @returns Updated vehicle details / Chi tiết phương tiện sau khi cập nhật.
   */
  @Patch(':id')
  @IsAdmin()
  @ZodSerializerDto(GetVehicleDetailResDTO)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVehicleDto: UpdateVehicleBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return this.vehicleService.update(userId, id, updateVehicleDto)
  }

  /**
   * Deletes a vehicle by ID.
   * Only accessible by Admin.
   * 
   * Xóa một phương tiện theo ID.
   * Chỉ Admin mới có thể truy cập.
   * 
   * @param id - Vehicle ID to delete / ID phương tiện cần xóa.
   * @param userId - ID of the active admin performing deletion / ID của admin thực hiện xóa.
   * @returns Status confirmation details / Chi tiết xác nhận trạng thái.
   */
  @Delete(':id')
  @IsAdmin()
  remove(@Param('id', ParseIntPipe) id: number, @ActiveUser('userId') userId: number) {
    return this.vehicleService.delete({ id, deletedById: userId })
  }
}
