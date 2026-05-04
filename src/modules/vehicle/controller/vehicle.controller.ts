import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '@src/common/decorators/active-user.decorator'
import { IsAdmin } from '@src/common/decorators/roles.decorator'
import {
  CreateVehicleBodyDTO,
  GetAllVehiclesQueryDTO,
  GetAllVehiclesResDTO,
  GetVehicleDetailResDTO,
  UpdateVehicleBodyDTO,
} from 'src/modules/vehicle/dto/vehicle.dto'
import { VehicleService } from 'src/modules/vehicle/service/vehicle.service'

@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  @IsAdmin()
  @ZodSerializerDto(GetVehicleDetailResDTO)
  create(@Body() body: CreateVehicleBodyDTO, @ActiveUser('userId') userId: number) {
    return this.vehicleService.create(userId, body)
  }

  @Get()
  @IsAdmin()
  @ZodSerializerDto(GetAllVehiclesResDTO)
  findAll(@Query() query: GetAllVehiclesQueryDTO) {
    return this.vehicleService.findAll(query)
  }

  @Get(':id')
  @IsAdmin()
  @ZodSerializerDto(GetVehicleDetailResDTO)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vehicleService.findById(id)
  }

  @Patch(':id')
  @IsAdmin()
  @ZodSerializerDto(GetVehicleDetailResDTO)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVehicleDto: UpdateVehicleBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return this.vehicleService.update(userId, id, updateVehicleDto)
  }

  @Delete(':id')
  @IsAdmin()
  remove(@Param('id', ParseIntPipe) id: number, @ActiveUser('userId') userId: number) {
    return this.vehicleService.delete({ id, deletedById: userId })
  }
}
