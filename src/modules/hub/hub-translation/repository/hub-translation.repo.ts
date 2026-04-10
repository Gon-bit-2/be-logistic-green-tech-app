import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import {
  CreateHubTranslationBodyType,
  UpdateHubTranslationBodyType,
} from 'src/modules/hub/hub-translation/model/hub-translation.model'

@Injectable()
export class HubTranslationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create({ createdById, data }: { createdById: number; data: CreateHubTranslationBodyType }) {
    return await this.prismaService.hubTranslation.create({
      data: {
        ...data,
        createdById,
      },
    })
  }

  async findById(id: number) {
    return await this.prismaService.hubTranslation.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async update({ updatedById, id, data }: { updatedById: number; id: number; data: UpdateHubTranslationBodyType }) {
    return await this.prismaService.hubTranslation.update({
      where: { id },
      data: { ...data, updatedById },
    })
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }, isHard?: boolean) {
    if (isHard) {
      const hubTranslation = await this.prismaService.hubTranslation.delete({
        where: {
          id,
        },
      })

      return hubTranslation
    }
    const [hubTranslation] = await Promise.all([
      this.prismaService.hubTranslation.update({
        where: {
          id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
          deletedById,
        },
      }),
    ])
    return hubTranslation
  }
}
