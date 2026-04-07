import { Injectable } from '@nestjs/common'
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
    return this.vehicleRepo.create(createdById, data)
  }

  async findAll(query: GetAllVehiclesQueryType) {
    return this.vehicleRepo.findAll(query)
  }

  async findById(id: number) {
    return this.vehicleRepo.findById(id)
  }

  async update(updatedById: number, id: number, data: UpdateVehicleBodyType) {
    return this.vehicleRepo.update(updatedById, id, data)
  }

  async delete({ id, deletedById }: { id: number; deletedById: number }) {
    return this.vehicleRepo.delete({ id, deletedById })
  }
}
