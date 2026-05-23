import { Injectable } from '@nestjs/common'
import { PrismaService } from '@src/database/prisma.service'
import {
  CreateVehicleBodyType,
  GetAllVehiclesQueryType,
  UpdateVehicleBodyType,
} from '@src/modules/vehicle/model/vehicle.model'

/**
 * Repository handling database operations for logistic Vehicles via Prisma.
 * 
 * Kho lưu trữ xử lý các hoạt động cơ sở dữ liệu cho Phương tiện vận chuyển thông qua Prisma.
 */
@Injectable()
export class VehicleRepository {
  /**
   * Initializes the VehicleRepository.
   * 
   * Khởi tạo VehicleRepository.
   * 
   * @param prismaService - Prisma service instance / Instance của dịch vụ Prisma.
   */
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Creates a new vehicle record in the database.
   * 
   * Tạo một bản ghi phương tiện vận chuyển mới trong cơ sở dữ liệu.
   * 
   * @param createdById - ID of the creator / ID của người thực hiện hành động tạo.
   * @param data - Vehicle creation payload / Payload tạo mới phương tiện.
   * @returns Created vehicle entity / Thực thể phương tiện được tạo.
   */
  async create(createdById: number, data: CreateVehicleBodyType) {
    return await this.prismaService.vehicle.create({ data: { ...data, createdById } })
  }

  /**
   * Retrieves all vehicles matching query parameters with pagination.
   * 
   * Lấy danh sách tất cả các phương tiện khớp với tham số truy vấn có hỗ trợ phân trang.
   * 
   * @param query - Search, filter, and pagination options / Các thiết lập tìm kiếm, lọc và phân trang.
   * @returns Paginated lists of vehicles and total count / Danh sách phương tiện phân trang và tổng số lượng.
   */
  async findAll(query: GetAllVehiclesQueryType) {
    const { page, limit, type, fuelType, isActive, search } = query
    const skip = (page - 1) * limit

    const where = {
      deletedAt: null,
      ...(type && { type }),
      ...(fuelType && { fuelType }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        licensePlate: { contains: search, mode: 'insensitive' as const },
      }),
    }

    const [data, totalItems] = await Promise.all([
      this.prismaService.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.vehicle.count({ where }),
    ])

    return { data, totalItems }
  }

  /**
   * Finds a vehicle by ID that is not deleted.
   * 
   * Tìm một phương tiện vận chuyển theo ID và đảm bảo chưa bị xóa.
   * 
   * @param id - Vehicle ID / ID phương tiện.
   * @returns Found vehicle entity or null / Thực thể phương tiện tìm thấy hoặc null.
   */
  async findById(id: number) {
    return await this.prismaService.vehicle.findFirst({
      where: { id, deletedAt: null },
    })
  }

  /**
   * Finds a vehicle by its license plate string.
   * 
   * Tìm một phương tiện vận chuyển theo biển số xe.
   * 
   * @param licensePlate - License plate string / Chuỗi ký tự biển số xe.
   * @returns Found vehicle entity or null / Thực thể phương tiện tìm thấy hoặc null.
   */
  async findByLicensePlate(licensePlate: string) {
    return await this.prismaService.vehicle.findFirst({
      where: { licensePlate, deletedAt: null },
    })
  }

  /**
   * Updates an existing vehicle record.
   * 
   * Cập nhật thông tin bản ghi một phương tiện hiện có.
   * 
   * @param updatedById - ID of the updater / ID của người thực hiện hành động cập nhật.
   * @param id - Vehicle ID / ID phương tiện.
   * @param data - Updated fields data / Dữ liệu thông tin các trường cần cập nhật.
   * @returns Updated vehicle entity / Thực thể phương tiện đã cập nhật.
   */
  async update(updatedById: number, id: number, data: UpdateVehicleBodyType) {
    return await this.prismaService.vehicle.update({
      where: { id },
      data: { ...data, updatedById },
    })
  }

  /**
   * Soft deletes a vehicle record in the database.
   * 
   * Xóa mềm bản ghi một phương tiện vận chuyển trong cơ sở dữ liệu.
   * 
   * @param param - Vehicle ID and deleter ID / ID phương tiện và ID người thực hiện xóa.
   * @returns Soft-deleted vehicle record / Bản ghi phương tiện đã xóa mềm.
   */
  async delete({ id, deletedById }: { id: number; deletedById: number }) {
    return await this.prismaService.vehicle.update({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedById,
      },
    })
  }
}
