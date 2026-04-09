import { Controller, Get, Post, Body, Param, Delete, Put } from '@nestjs/common'
import { LanguageService } from './language.service'
import {
  GetLanguageDetailResDTO,
  GetLanguageParamsDTO,
  GetLanguageResDTO,
  LanguageBodyDto,
  LanguageUpdateBodyDto,
} from './dto/language.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { MessageResDTO } from 'src/common/dtos/response.dto'

@Controller('language')
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Post()
  @ZodSerializerDto(GetLanguageDetailResDTO)
  createLanguage(@Body() body: LanguageBodyDto, @ActiveUser('userId') userId: number) {
    return this.languageService.createLanguage({ data: body, createdById: userId })
  }

  @Get()
  @ZodSerializerDto(GetLanguageResDTO)
  findAll() {
    return this.languageService.findAll()
  }

  @Get(':languageId')
  @ZodSerializerDto(GetLanguageDetailResDTO)
  findById(@Param() params: GetLanguageParamsDTO) {
    return this.languageService.findById(params.languageId)
  }

  @Put(':languageId')
  @ZodSerializerDto(GetLanguageDetailResDTO)
  update(
    @Param() params: GetLanguageParamsDTO,
    @Body() body: LanguageUpdateBodyDto,
    @ActiveUser('userId') userId: number,
  ) {
    return this.languageService.update({ languageId: params.languageId, data: body, updateById: userId })
  }

  @Delete(':languageId')
  @ZodSerializerDto(MessageResDTO)
  remove(@Param() params: GetLanguageParamsDTO) {
    return this.languageService.remove(params.languageId)
  }
}
