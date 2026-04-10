import { Injectable } from '@nestjs/common'
import { LanguageRepository } from 'src/modules/language/repository/language.repository'
import { CreateLanguageType, UpdateLanguageType } from 'src/modules/language/model/language.model'

@Injectable()
export class LanguageService {
  constructor(private readonly languageRepository: LanguageRepository) {}

  async findAll() {
    const languages = await this.languageRepository.findAll()
    return {
      data: languages,
      totalItems: languages.length,
    }
  }

  async findById(id: string) {
    const language = await this.languageRepository.findOne(id)
    if (!language) {
      throw new Error('Ngôn ngữ không tồn tại')
    }
    return language
  }

  async createLanguage({ data, createdById }: { data: CreateLanguageType; createdById: number }) {
    const language = await this.languageRepository.findOne(data.id)
    if (language) {
      throw new Error('Ngôn ngữ đã tồn tại')
    }
    const newLanguage = await this.languageRepository.createLanguage({ data, createdById })
    return newLanguage
  }

  async update({ languageId, data, updateById }: { languageId: string; data: UpdateLanguageType; updateById: number }) {
    const language = await this.languageRepository.findOne(languageId)
    if (!language) {
      throw new Error('Ngôn ngữ không tồn tại')
    }
    const updatedLanguage = await this.languageRepository.updateLanguage({ languageId, data, updateById })
    return updatedLanguage
  }

  async remove(id: string) {
    const language = await this.languageRepository.findOne(id)
    if (!language) {
      throw new Error('Ngôn ngữ không tồn tại')
    }
    await this.languageRepository.deleteLanguage(id, true)
    return {
      message: 'Xóa Thành Công',
    }
  }
}
