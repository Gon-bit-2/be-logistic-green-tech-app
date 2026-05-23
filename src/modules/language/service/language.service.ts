import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createErrorResponse, ErrorCode } from 'src/common/errors/error-codes'
import { LanguageRepository } from 'src/modules/language/repository/language.repository'
import { CreateLanguageType, UpdateLanguageType } from 'src/modules/language/model/language.model'

/**
 * Service handling business logic for language configurations.
 * Coordinates with the language repository to perform CRUD operations on supported languages.
 * 
 * Dịch vụ xử lý logic nghiệp vụ cho cấu hình ngôn ngữ.
 * Phối hợp với repository ngôn ngữ để thực hiện các thao tác CRUD trên các ngôn ngữ được hỗ trợ.
 */
@Injectable()
export class LanguageService {
  /**
   * Initializes the LanguageService.
   * 
   * Khởi tạo LanguageService.
   * 
   * @param languageRepository - The Language repository instance / Instance của repository ngôn ngữ.
   */
  constructor(private readonly languageRepository: LanguageRepository) {}

  /**
   * Retrieves all language configurations.
   * 
   * Lấy tất cả các cấu hình ngôn ngữ.
   * 
   * @returns An object containing the list of languages and the total count / Đối tượng chứa danh sách ngôn ngữ và tổng số lượng.
   */
  async findAll() {
    const languages = await this.languageRepository.findAll()
    return {
      data: languages,
      totalItems: languages.length,
    }
  }

  /**
   * Retrieves a single language configuration by its ID.
   * 
   * Lấy một cấu hình ngôn ngữ theo ID.
   * 
   * @param id - The unique ID of the language / ID duy nhất của ngôn ngữ.
   * @returns The language detail / Thông tin chi tiết ngôn ngữ.
   * @throws NotFoundException - If the language does not exist / Nếu ngôn ngữ không tồn tại.
   */
  async findById(id: string) {
    const language = await this.languageRepository.findOne(id)
    if (!language) {
      throw new NotFoundException(createErrorResponse(ErrorCode.Language.NotFound))
    }
    return language
  }

  /**
   * Creates a new language configuration.
   * 
   * Tạo một cấu hình ngôn ngữ mới.
   * 
   * @param params - Contains data and creator's ID / Chứa thông tin tạo và ID của người tạo.
   * @param params.data - The language data to create / Dữ liệu ngôn ngữ cần tạo.
   * @param params.createdById - The ID of the user creating the language / ID của người dùng tạo ngôn ngữ.
   * @returns The newly created language details / Chi tiết ngôn ngữ vừa tạo.
   * @throws ConflictException - If a language with the same ID already exists / Nếu ngôn ngữ với ID tương tự đã tồn tại.
   */
  async createLanguage({ data, createdById }: { data: CreateLanguageType; createdById: number }) {
    const language = await this.languageRepository.findOne(data.id)
    if (language) {
      throw new ConflictException(createErrorResponse(ErrorCode.Language.Conflict))
    }
    const newLanguage = await this.languageRepository.createLanguage({ data, createdById })
    return newLanguage
  }

  /**
   * Updates an existing language configuration.
   * 
   * Cập nhật một cấu hình ngôn ngữ hiện có.
   * 
   * @param params - Contains languageId, data, and updater's ID / Chứa ID ngôn ngữ, thông tin cập nhật và ID của người cập nhật.
   * @param params.languageId - The ID of the language to update / ID của ngôn ngữ cần cập nhật.
   * @param params.data - The updated language data / Dữ liệu ngôn ngữ đã cập nhật.
   * @param params.updateById - The ID of the user updating the language / ID của người dùng cập nhật ngôn ngữ.
   * @returns The updated language details / Chi tiết ngôn ngữ sau khi cập nhật.
   * @throws NotFoundException - If the language does not exist / Nếu ngôn ngữ không tồn tại.
   */
  async update({ languageId, data, updateById }: { languageId: string; data: UpdateLanguageType; updateById: number }) {
    const language = await this.languageRepository.findOne(languageId)
    if (!language) {
      throw new NotFoundException(createErrorResponse(ErrorCode.Language.NotFound))
    }
    const updatedLanguage = await this.languageRepository.updateLanguage({ languageId, data, updateById })
    return updatedLanguage
  }

  /**
   * Deletes a language configuration by its ID (soft-delete).
   * 
   * Xóa một cấu hình ngôn ngữ theo ID (xóa mềm).
   * 
   * @param id - The ID of the language to delete / ID của ngôn ngữ cần xóa.
   * @param deletedById - The ID of the user deleting the language / ID của người dùng thực hiện xóa.
   * @returns A success message / Thông báo thành công.
   * @throws NotFoundException - If the language does not exist / Nếu ngôn ngữ không tồn tại.
   */
  async remove(id: string, deletedById: number) {
    const language = await this.languageRepository.findOne(id)
    if (!language) {
      throw new NotFoundException(createErrorResponse(ErrorCode.Language.NotFound))
    }
    await this.languageRepository.deleteLanguage(id, deletedById)
    return {
      message: 'Xóa Thành Công',
    }
  }
}
