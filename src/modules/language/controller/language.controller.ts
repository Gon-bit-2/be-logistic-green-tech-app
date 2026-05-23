import { Controller, Get, Post, Body, Param, Delete, Put } from '@nestjs/common'
import { LanguageService } from 'src/modules/language/service/language.service'
import {
  GetLanguageDetailResDTO,
  GetLanguageParamsDTO,
  GetLanguageResDTO,
  LanguageBodyDto,
  LanguageUpdateBodyDto,
} from 'src/modules/language/dto/language.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { MessageResDTO } from 'src/common/dtos/response.dto'

/**
 * Controller for managing languages supported in the application.
 * Provides endpoints for creating, retrieving, updating, and deleting language configurations.
 * 
 * Controller quản lý các ngôn ngữ được hỗ trợ trong ứng dụng.
 * Cung cấp các endpoint để tạo, lấy thông tin, cập nhật và xóa các cấu hình ngôn ngữ.
 */
@Controller('language')
export class LanguageController {
  /**
   * Initializes the LanguageController.
   * 
   * Khởi tạo LanguageController.
   * 
   * @param languageService - The Language service instance / Instance của dịch vụ ngôn ngữ.
   */
  constructor(private readonly languageService: LanguageService) {}

  /**
   * Creates a new language configuration.
   * 
   * Tạo một cấu hình ngôn ngữ mới.
   * 
   * @param body - The language creation request body / Dữ liệu yêu cầu tạo ngôn ngữ mới.
   * @param userId - The ID of the user creating the language / ID của người dùng tạo ngôn ngữ.
   * @returns The newly created language details / Chi tiết ngôn ngữ vừa được tạo mới.
   */
  @Post()
  @ZodSerializerDto(GetLanguageDetailResDTO)
  createLanguage(@Body() body: LanguageBodyDto, @ActiveUser('userId') userId: number) {
    return this.languageService.createLanguage({ data: body, createdById: userId })
  }

  /**
   * Retrieves a list of all languages.
   * 
   * Lấy danh sách tất cả các ngôn ngữ.
   * 
   * @returns A list of languages / Danh sách các ngôn ngữ.
   */
  @Get()
  @ZodSerializerDto(GetLanguageResDTO)
  findAll() {
    return this.languageService.findAll()
  }

  /**
   * Retrieves detail of a language by its ID.
   * 
   * Lấy chi tiết thông tin một ngôn ngữ theo ID.
   * 
   * @param params - Parameters containing the target language ID / Các tham số chứa ID ngôn ngữ mục tiêu.
   * @returns The language detail / Thông tin chi tiết của ngôn ngữ.
   */
  @Get(':languageId')
  @ZodSerializerDto(GetLanguageDetailResDTO)
  findById(@Param() params: GetLanguageParamsDTO) {
    return this.languageService.findById(params.languageId)
  }

  /**
   * Updates an existing language configuration.
   * 
   * Cập nhật một cấu hình ngôn ngữ hiện có.
   * 
   * @param params - Parameters containing the target language ID / Các tham số chứa ID ngôn ngữ mục tiêu.
   * @param body - The language update request body / Dữ liệu cập nhật ngôn ngữ.
   * @param userId - The ID of the user performing the update / ID của người dùng thực hiện cập nhật.
   * @returns The updated language details / Chi tiết ngôn ngữ sau khi cập nhật.
   */
  @Put(':languageId')
  @ZodSerializerDto(GetLanguageDetailResDTO)
  update(
    @Param() params: GetLanguageParamsDTO,
    @Body() body: LanguageUpdateBodyDto,
    @ActiveUser('userId') userId: number,
  ) {
    return this.languageService.update({ languageId: params.languageId, data: body, updateById: userId })
  }

  /**
   * Deletes a language configuration by its ID.
   * 
   * Xóa một cấu hình ngôn ngữ theo ID.
   * 
   * @param params - Parameters containing the target language ID / Các tham số chứa ID ngôn ngữ mục tiêu.
   * @param userId - The ID of the user performing the deletion / ID của người dùng thực hiện xóa.
   * @returns A confirmation message / Thông báo xác nhận kết quả.
   */
  @Delete(':languageId')
  @ZodSerializerDto(MessageResDTO)
  remove(@Param() params: GetLanguageParamsDTO, @ActiveUser('userId') userId: number) {
    return this.languageService.remove(params.languageId, userId)
  }
}
