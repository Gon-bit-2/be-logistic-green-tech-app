import { Injectable } from '@nestjs/common'
import { CreateLanguageType, UpdateLanguageType } from 'src/modules/language/model/language.model'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class LanguageRepository {
  constructor(private readonly prismaService: PrismaService) {}
  findAll() {
    return this.prismaService.language.findMany({
      where: {
        deletedAt: null,
      },
    })
  }
  findOne(id: string) {
    return this.prismaService.language.findUnique({ where: { id, deletedAt: null } })
  }
  createLanguage({ createdById, data }: { createdById: number; data: CreateLanguageType }) {
    return this.prismaService.language.create({
      data: {
        ...data,
        createdById,
      },
    })
  }
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
