import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { IsAdmin } from 'src/common/decorators/roles.decorator'
import {
  AssignStaffBodyDTO,
  AssignDriverBodyDTO,
  CreateHubBodyDTO,
  GetAllHubsQueryDTO,
  GetAllHubsResDTO,
  GetHubAssignableUsersQueryDTO,
  HubDetailResDTO,
  UpdateHubBodyDTO,
} from 'src/modules/hub/dto/hub.dto'
import { HubService } from 'src/modules/hub/service/hub.service'
import { MessageResDTO } from 'src/common/dtos/response.dto'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'

@Controller('hubs')
export class HubController {
  constructor(private readonly hubService: HubService) {}

  @Post()
  @IsAdmin()
  @ZodSerializerDto(HubDetailResDTO)
  create(@Body() body: CreateHubBodyDTO) {
    return this.hubService.create(body)
  }

  @Get()
  @ZodSerializerDto(GetAllHubsResDTO)
  findAll(@Query() query: GetAllHubsQueryDTO) {
    return this.hubService.findAll(query)
  }

  @Get(':id/assignable-users')
  @IsAdmin()
  findAssignableUsers(@Param('id', ParseIntPipe) id: number, @Query() query: GetHubAssignableUsersQueryDTO) {
    return this.hubService.findAssignableUsers(id, query)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.hubService.findById(id)
  }

  @Patch(':id')
  @IsAdmin()
  @ZodSerializerDto(HubDetailResDTO)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateHubBodyDTO) {
    return this.hubService.update(id, body)
  }

  @Delete(':id')
  @IsAdmin()
  @ZodSerializerDto(MessageResDTO)
  async remove(@Param('id', ParseIntPipe) id: number, @ActiveUser('userId') userId: number) {
    await this.hubService.delete(id, userId)
    return { message: 'Xóa kho trung chuyển thành công' }
  }

  @Post(':id/staff')
  @IsAdmin()
  assignStaff(@Param('id', ParseIntPipe) id: number, @Body() body: AssignStaffBodyDTO) {
    return this.hubService.assignStaff(id, body.userId)
  }

  @Delete(':id/staff/:userId')
  @IsAdmin()
  @ZodSerializerDto(MessageResDTO)
  async removeStaff(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    await this.hubService.removeStaff(id, userId)
    return { message: 'Xoá nhân viên khỏi kho trung chuyển thành công' }
  }

  @Post(':id/drivers')
  @IsAdmin()
  assignDriver(@Param('id', ParseIntPipe) id: number, @Body() body: AssignDriverBodyDTO) {
    return this.hubService.assignDriver(id, body.userId)
  }

  @Delete(':id/drivers/:userId')
  @IsAdmin()
  @ZodSerializerDto(MessageResDTO)
  async removeDriver(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    await this.hubService.removeDriver(id, userId)
    return { message: 'Xoá tài xế khỏi kho trung chuyển thành công' }
  }
}
