import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common'
import { VehicleTranslationService } from '../service/vehicle-translation.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  CreateVehicleTranslationBodyDTO,
  DeleteVehicleTranslationParamsDTO,
  GetVehicleTranslationDetailResDTO,
  GetVehicleTranslationParamsDTO,
  UpdateVehicleTranslationBodyDTO,
} from '../dto/vehicle-translation.dto'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'

@Controller('vehicle-translation')
export class VehicleTranslationController {
  constructor(private readonly vehicleTranslationService: VehicleTranslationService) {}

  @Get(':vehicleTranslationId')
  @ZodSerializerDto(GetVehicleTranslationDetailResDTO)
  async findById(@Param() params: GetVehicleTranslationParamsDTO) {
    return this.vehicleTranslationService.findById(params.vehicleTranslationId)
  }

  @Post()
  @ZodSerializerDto(GetVehicleTranslationDetailResDTO)
  async create(@Body() body: CreateVehicleTranslationBodyDTO, @ActiveUser('userId') userId: number) {
    return this.vehicleTranslationService.create({ data: body, createdById: userId })
  }

  @Patch(':vehicleTranslationId')
  @ZodSerializerDto(GetVehicleTranslationDetailResDTO)
  async update(
    @Param() params: GetVehicleTranslationParamsDTO,
    @Body() body: UpdateVehicleTranslationBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return this.vehicleTranslationService.update({ data: body, updatedById: userId, id: params.vehicleTranslationId })
  }

  @Delete(':vehicleTranslationId')
  @ZodSerializerDto(DeleteVehicleTranslationParamsDTO)
  async delete(@Param() params: GetVehicleTranslationParamsDTO, @ActiveUser('userId') userId: number) {
    return this.vehicleTranslationService.delete({ deletedById: userId, id: params.vehicleTranslationId })
  }
}
