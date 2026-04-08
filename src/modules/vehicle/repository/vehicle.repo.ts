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
    return await this.prisma.vehicle.create({ data: { ...data, createdById } })
  }

  async findAll(query: GetAllVehiclesQueryType) {
    const { page, limit, type, fuelType, isActive, search } = query
    const skip = (page - 1) * limit

    const where = {
      deletedAt: null,
      ...(type && { type }),
      ...(fuelType && { fuelType }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        licensePlate: { contains: search, mode: 'insensitive' as const },
      }),
    }

    const [data, totalItems] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ])

    return { data, totalItems }
  }

  async findById(id: number) {
    return await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async findByLicensePlate(licensePlate: string) {
    return await this.prisma.vehicle.findFirst({
      where: { licensePlate, deletedAt: null },
    })
  }

  async update(updatedById: number, id: number, data: UpdateVehicleBodyType) {
    return await this.prisma.vehicle.update({
      where: { id },
      data: { ...data, updatedById },
    })
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }, isHard?: boolean) {
    if (isHard) {
      return await this.prisma.vehicle.delete({ where: { id } })
    }
    return await this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById },
    })
  }
}
