import { Injectable } from '@nestjs/common'
import { CreateLanguageType, UpdateLanguageType } from 'src/modules/language/model/language.model'
import { PrismaService } from 'src/database/prisma.service'

/**
 * Repository class for performing database operations on Language entities.
 * Directly interacts with Prisma to handle language configurations.
 * 
 * Lớp Repository để thực hiện các thao tác trên cơ sở dữ liệu cho các thực thể Ngôn ngữ.
 * Tương tác trực tiếp với Prisma để xử lý cấu hình ngôn ngữ.
 */
@Injectable()
export class LanguageRepository {
  /**
   * Initializes the LanguageRepository.
   * 
   * Khởi tạo LanguageRepository.
   * 
   * @param prismaService - The Prisma service instance / Instance của dịch vụ Prisma.
   */
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Retrieves all languages that are not soft-deleted.
   * 
   * Lấy tất cả các ngôn ngữ chưa bị xóa mềm.
   * 
   * @returns A promise resolving to an array of active languages / Một promise trả về danh sách các ngôn ngữ đang hoạt động.
   */
  findAll() {
    return this.prismaService.language.findMany({
      where: {
        deletedAt: null,
      },
    })
  }

  /**
   * Finds a language by its unique ID, ensuring it is not soft-deleted.
   * 
   * Tìm kiếm một ngôn ngữ bằng ID duy nhất của nó, đảm bảo nó chưa bị xóa mềm.
   * 
   * @param id - The language ID / ID của ngôn ngữ.
   * @returns A promise resolving to the language or null / Một promise trả về ngôn ngữ hoặc null.
   */
  findOne(id: string) {
    return this.prismaService.language.findUnique({ where: { id, deletedAt: null } })
  }

  /**
   * Inserts a new language into the database.
   * 
   * Thêm một ngôn ngữ mới vào cơ sở dữ liệu.
   * 
   * @param params - Contains creator ID and language details / Chứa ID người tạo và thông tin chi tiết ngôn ngữ.
   * @param params.createdById - The ID of the user creating this record / ID của người dùng tạo bản ghi này.
   * @param params.data - The language configuration details / Thông tin chi tiết cấu hình ngôn ngữ.
   * @returns A promise resolving to the created language / Một promise trả về ngôn ngữ được tạo.
   */
  createLanguage({ createdById, data }: { createdById: number; data: CreateLanguageType }) {
    return this.prismaService.language.create({
      data: {
        ...data,
        createdById,
      },
    })
  }

  /**
   * Updates an existing language configuration.
   * 
   * Cập nhật một cấu hình ngôn ngữ hiện có.
   * 
   * @param params - Contains language ID, updater ID, and update fields / Chứa ID ngôn ngữ, ID người cập nhật và các trường cập nhật.
   * @param params.languageId - The target language ID / ID ngôn ngữ mục tiêu.
   * @param params.updateById - The ID of the user updating this record / ID của người dùng cập nhật bản ghi này.
   * @param params.data - The fields to update / Các trường dữ liệu cần cập nhật.
   * @returns A promise resolving to the updated language / Một promise trả về ngôn ngữ sau khi cập nhật.
   */
  updateLanguage({
    languageId,
    updateById,
    data,
  }: {
    languageId: string
    updateById: number
    data: UpdateLanguageType
  }) {
    return this.prismaService.language.update({
      where: { id: languageId },
      data: {
        ...data,
        updatedById: updateById,
      },
    })
  }

  /**
   * Performs a soft-delete on a language by setting deletedAt and deletedById.
   * 
   * Thực hiện xóa mềm một ngôn ngữ bằng cách thiết lập deletedAt và deletedById.
   * 
   * @param id - The ID of the language to delete / ID của ngôn ngữ cần xóa.
   * @param deletedById - The ID of the user performing the deletion / ID của người dùng thực hiện xóa.
   * @returns A promise resolving to the soft-deleted language / Một promise trả về ngôn ngữ đã được xóa mềm.
   */
  deleteLanguage(id: string, deletedById: number) {
    return this.prismaService.language.update({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedById,
      },
    })
  }
}
