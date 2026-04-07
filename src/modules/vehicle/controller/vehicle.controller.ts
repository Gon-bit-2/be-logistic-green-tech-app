import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { IsAdmin } from 'src/common/decorators/roles.decorator'
import {
  CreateVehicleBodyDTO,
  GetAllVehiclesQueryDTO,
  GetAllVehiclesResDTO,
  UpdateVehicleBodyDTO,
} from 'src/modules/vehicle/dto/vehicle.dto'
import { VehicleService } from 'src/modules/vehicle/service/vehicle.service'

@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  @IsAdmin()
  @ZodSerializerDto(CreateVehicleBodyDTO)
  create(@Body() body: CreateVehicleBodyDTO, @ActiveUser('userId') userId: number) {
    return this.vehicleService.create(userId, body)
  }

  @Get()
  @IsAdmin()
  @ZodSerializerDto(GetAllVehiclesResDTO)
  findAll(@Body() body: GetAllVehiclesQueryDTO) {
    return this.vehicleService.findAll(body)
  }

  @Get(':id')
  @IsAdmin()
  findOne(@Param('id') id: number) {
    return this.vehicleService.findById(id)
  }

  @Patch(':id')
  @IsAdmin()
  update(
    @Param('id') id: number,
    @Body() updateVehicleDto: UpdateVehicleBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return this.vehicleService.update(userId, id, updateVehicleDto)
  }

  @Delete(':id')
  @IsAdmin()
  remove(@Param('id') id: number, @ActiveUser('userId') userId: number) {
    return this.vehicleService.delete({ id, deletedById: userId })
  }
}
