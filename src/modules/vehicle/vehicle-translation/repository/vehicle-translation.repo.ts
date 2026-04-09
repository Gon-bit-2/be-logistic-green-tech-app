import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import {
  CreateVehicleTranslationBodyType,
  UpdateVehicleTranslationBodyType,
} from 'src/modules/vehicle/vehicle-translation/model/vehicle-translation.model'

@Injectable()
export class VehicleTranslationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create({ createdById, data }: { createdById: number; data: CreateVehicleTranslationBodyType }) {
    return await this.prismaService.vehicleTranslation.create({
      data: { ...data, createdById },
    })
  }

  async findById(id: number) {
    return await this.prismaService.vehicleTranslation.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async update({ updatedById, id, data }: { updatedById: number; id: number; data: UpdateVehicleTranslationBodyType }) {
    return await this.prismaService.vehicleTranslation.update({
      where: { id },
      data: { ...data, updatedById },
    })
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }, isHard?: boolean) {
    if (isHard) {
      const vehicleTranslation = await this.prismaService.vehicleTranslation.delete({
        where: {
          id,
        },
      })

      return vehicleTranslation
    }
    const [vehicleTranslation] = await Promise.all([
      this.prismaService.vehicleTranslation.update({
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
    return vehicleTranslation
  }
}
