import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  CreateVehicleBodyType,
  GetAllVehiclesQueryType,
  UpdateVehicleBodyType,
  VehicleSchemaType,
} from '@src/modules/vehicle/model/vehicle.model'
import { VehicleRepository } from '@src/modules/vehicle/repository/vehicle.repo'

/**
 * Service managing logistic vehicle states, capacity rules, and validation.
 * 
 * Dịch vụ quản lý trạng thái phương tiện, quy tắc tải trọng và xác thực.
 */
@Injectable()
export class VehicleService {
  /**
   * Initializes the VehicleService.
   * 
   * Khởi tạo VehicleService.
   * 
   * @param vehicleRepo - Repository for vehicle database queries / Repository xử lý truy vấn database của phương tiện.
   */
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  /**
   * Creates a new vehicle in the system. Ensures the license plate is unique.
   * 
   * Tạo một phương tiện vận chuyển mới. Đảm bảo biển số xe là duy nhất.
   * 
   * @param createdById - ID of the admin creator / ID của admin thực hiện tạo.
   * @param data - Vehicle creation payload / Payload tạo mới phương tiện.
   * @returns Detailed info of the newly created vehicle / Chi tiết phương tiện vừa tạo mới.
   * @throws ConflictException if the license plate is already registered / ConflictException nếu biển số xe đã được đăng ký.
   */
  async create(createdById: number, data: CreateVehicleBodyType): Promise<VehicleSchemaType> {
    const existing = await this.vehicleRepo.findByLicensePlate(data.licensePlate)
    if (existing) {
      throw new ConflictException('Biển số xe đã tồn tại trong hệ thống')
    }
    return this.vehicleRepo.create(createdById, data)
  }

  /**
   * Finds all vehicles based on pagination, status, and type filters.
   * 
   * Tìm tất cả các phương tiện dựa theo phân trang, trạng thái và bộ lọc loại xe.
   * 
   * @param query - Pagination and filtering parameters / Các tham số phân trang và lọc.
   * @returns Paginated list of vehicles and total count / Danh sách phương tiện phân trang và tổng số.
   */
  async findAll(query: GetAllVehiclesQueryType) {
    return this.vehicleRepo.findAll(query)
  }

  /**
   * Finds a specific vehicle by its unique ID. Throws NotFoundException if not found.
   * 
   * Tìm một phương tiện cụ thể theo ID duy nhất. Ném ra NotFoundException nếu không tìm thấy.
   * 
   * @param id - Vehicle ID / ID phương tiện.
   * @returns Found vehicle entity / Thực thể phương tiện tìm thấy.
   * @throws NotFoundException if the vehicle doesn't exist / NotFoundException nếu phương tiện không tồn tại.
   */
  async findById(id: number) {
    const vehicle = await this.vehicleRepo.findById(id)
    if (!vehicle) {
      throw new NotFoundException('Không tìm thấy phương tiện')
    }
    return vehicle
  }

  /**
   * Updates an existing vehicle's fields. Validates new license plate uniqueness.
   * 
   * Cập nhật thông tin chi tiết một phương tiện hiện có. Xác thực tính duy nhất của biển số xe mới.
   * 
   * @param updatedById - ID of the admin updating / ID của admin thực hiện cập nhật.
   * @param id - Vehicle ID / ID phương tiện.
   * @param data - Updated fields payload / Payload các trường thông tin cần cập nhật.
   * @returns Updated vehicle entity / Thực thể phương tiện đã cập nhật.
   * @throws ConflictException if the new license plate is already in use by another vehicle / ConflictException nếu biển số xe mới đã được dùng bởi xe khác.
   */
  async update(updatedById: number, id: number, data: UpdateVehicleBodyType) {
    await this.findById(id)

    if (data.licensePlate) {
      const existing = await this.vehicleRepo.findByLicensePlate(data.licensePlate)
      if (existing && existing.id !== id) {
        throw new ConflictException('Biển số xe đã tồn tại trong hệ thống')
      }
    }

    return this.vehicleRepo.update(updatedById, id, data)
  }

  /**
   * Soft deletes a vehicle by ID.
   * 
   * Xóa mềm một phương tiện theo ID.
   * 
   * @param param - Object containing vehicle ID and the deleter's user ID / Đối tượng chứa ID phương tiện và ID người thực hiện xóa.
   * @returns Soft-deleted vehicle record / Bản ghi phương tiện đã xóa mềm.
   */
  async delete({ id, deletedById }: { id: number; deletedById: number }) {
    await this.findById(id)
    return this.vehicleRepo.delete({ id, deletedById })
  }
}
