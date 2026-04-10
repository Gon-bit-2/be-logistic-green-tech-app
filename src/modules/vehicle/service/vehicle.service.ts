import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  CreateVehicleBodyType,
  GetAllVehiclesQueryType,
  UpdateVehicleBodyType,
} from 'src/modules/vehicle/model/vehicle.model'
import { VehicleRepository } from 'src/modules/vehicle/repository/vehicle.repo'

@Injectable()
export class VehicleService {
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async create(createdById: number, data: CreateVehicleBodyType) {
    const existing = await this.vehicleRepo.findByLicensePlate(data.licensePlate)
    if (existing) {
      throw new ConflictException('Biển số xe đã tồn tại trong hệ thống')
    }
    return this.vehicleRepo.create(createdById, data)
  }

  async findAll(query: GetAllVehiclesQueryType) {
    return this.vehicleRepo.findAll(query)
  }

  async findById(id: number) {
    const vehicle = await this.vehicleRepo.findById(id)
    if (!vehicle) {
      throw new NotFoundException('Không tìm thấy phương tiện')
    }
    return vehicle
  }

  async update(updatedById: number, id: number, data: UpdateVehicleBodyType) {
    await this.findById(id)

    if (data.licensePlate) {
      const existing = await this.vehicleRepo.findByLicensePlate(data.licensePlate)
      if (existing && existing.id !== id) {
        throw new ConflictException('Biển số xe đã tồn tại trong hệ thống')
      }
    }

    return this.vehicleRepo.update(updatedById, id, data)
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }) {
    await this.findById(id)
    return this.vehicleRepo.delete({ id, deletedById })
  }
}
