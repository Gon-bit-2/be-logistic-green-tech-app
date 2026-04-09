import { Injectable } from '@nestjs/common'
import { VehicleTranslationRepository } from '../repository/vehicle-translation.repo'
import { NotFoundException } from '@nestjs/common'
import {
  CreateVehicleTranslationBodyType,
  UpdateVehicleTranslationBodyType,
} from 'src/modules/vehicle/vehicle-translation/model/vehicle-translation.model'
import { Prisma } from 'generated/prisma'
import { NotFoundRecordException } from 'src/common/error/error'

@Injectable()
export class VehicleTranslationService {
  constructor(private readonly vehicleTranslationRepo: VehicleTranslationRepository) {}
  async findById(id: number) {
    const vehicleTranslation = await this.vehicleTranslationRepo.findById(id)
    if (!vehicleTranslation) {
      throw NotFoundRecordException
    }
    return vehicleTranslation
  }
  async create({ createdById, data }: { createdById: number; data: CreateVehicleTranslationBodyType }) {
    try {
      return await this.vehicleTranslationRepo.create({ data, createdById })
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
  async update({ updatedById, id, data }: { updatedById: number; id: number; data: UpdateVehicleTranslationBodyType }) {
    try {
      return await this.vehicleTranslationRepo.update({ updatedById, id, data })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw NotFoundRecordException
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw NotFoundRecordException
      }
      if (error instanceof NotFoundException) {
        throw NotFoundRecordException
      }
      throw error
    }
  }
  async delete({ deletedById, id }: { deletedById: number; id: number }) {
    try {
      return await this.vehicleTranslationRepo.delete({ deletedById, id })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw NotFoundRecordException
      }
      if (error instanceof NotFoundException) {
        throw NotFoundRecordException
      }
      throw error
    }
  }
}
