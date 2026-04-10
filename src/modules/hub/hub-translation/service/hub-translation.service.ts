import { Injectable, NotFoundException } from '@nestjs/common'
import { HubTranslationRepository } from 'src/modules/hub/hub-translation/repository/hub-translation.repo'
import {
  CreateHubTranslationBodyType,
  UpdateHubTranslationBodyType,
} from 'src/modules/hub/hub-translation/model/hub-translation.model'
import { Prisma } from 'generated/prisma'
import { NotFoundRecordException } from 'src/common/error/error'

@Injectable()
export class HubTranslationService {
  constructor(private readonly hubTranslationRepo: HubTranslationRepository) {}
  async create({ createdById, data }: { createdById: number; data: CreateHubTranslationBodyType }) {
    try {
      return await this.hubTranslationRepo.create({ data, createdById })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw NotFoundRecordException
      }
      if (error instanceof NotFoundException) {
        throw NotFoundRecordException
      }
      throw error
    }
  }

  async findById(id: number) {
    try {
      return await this.hubTranslationRepo.findById(id)
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw NotFoundRecordException
      }
      throw error
    }
  }

  async update({ updatedById, id, data }: { updatedById: number; id: number; data: UpdateHubTranslationBodyType }) {
    try {
      return await this.hubTranslationRepo.update({ updatedById, id, data })
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw NotFoundRecordException
      }
      throw error
    }
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }, isHard?: boolean) {
    try {
      return await this.hubTranslationRepo.delete({ id, deletedById }, isHard)
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw NotFoundRecordException
      }
      throw error
    }
  }
}
