import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import {
  CreateVehicleBodyType,
  GetAllVehiclesQueryType,
  UpdateVehicleBodyType,
} from 'src/modules/vehicle/model/vehicle.model'

@Injectable()
export class VehicleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(createdById: number, data: CreateVehicleBodyType) {
    return this.prisma.vehicle.create({ data: { ...data, createdById } })
  }

  async findAll(query: GetAllVehiclesQueryType) {
    return this.prisma.vehicle.findMany({ where: query })
  }

  async findById(id: number) {
    return this.prisma.vehicle.findUnique({ where: { id } })
  }

  async update(updatedById: number, id: number, data: UpdateVehicleBodyType) {
    return this.prisma.vehicle.update({ where: { id }, data: { ...data, updatedById } })
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }, isHard?: boolean) {
    if (isHard) {
      return this.prisma.vehicle.delete({ where: { id } })
    }
    return this.prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date(), deletedById } })
  }
}
