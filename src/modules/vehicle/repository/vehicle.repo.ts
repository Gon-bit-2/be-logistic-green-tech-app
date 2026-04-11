import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import {
  CreateVehicleBodyType,
  GetAllVehiclesQueryType,
  UpdateVehicleBodyType,
} from 'src/modules/vehicle/model/vehicle.model'

@Injectable()
export class VehicleRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createdById: number, data: CreateVehicleBodyType) {
    return await this.prismaService.vehicle.create({ data: { ...data, createdById } })
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
      this.prismaService.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.vehicle.count({ where }),
    ])

    return { data, totalItems }
  }

  async findById(id: number) {
    return await this.prismaService.vehicle.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async findByLicensePlate(licensePlate: string) {
    return await this.prismaService.vehicle.findFirst({
      where: { licensePlate, deletedAt: null },
    })
  }

  async update(updatedById: number, id: number, data: UpdateVehicleBodyType) {
    return await this.prismaService.vehicle.update({
      where: { id },
      data: { ...data, updatedById },
    })
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }) {
    return await this.prismaService.vehicle.update({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedById,
      },
    })
  }
}
