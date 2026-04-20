import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { IsAdmin, Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { RoleService } from '../service/role.service'
import {
  ApproveRoleRequestBodyDTO,
  CreateRoleRequestBodyDTO,
  GetRoleRequestsQueryDTO,
  GetRoleRequestsResDTO,
  RejectRoleRequestBodyDTO,
  RoleRequestItemDTO,
} from '../dto/role.dto'

@Controller('role-requests')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @Roles(roleName.CUSTOMER, roleName.DRIVER, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(RoleRequestItemDTO)
  create(@ActiveUser('userId') userId: number, @Body() body: CreateRoleRequestBodyDTO) {
    return this.roleService.create(userId, body)
  }

  @Get('me')
  @Roles(roleName.CUSTOMER, roleName.DRIVER, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(GetRoleRequestsResDTO)
  findMine(@ActiveUser('userId') userId: number, @Query() query: GetRoleRequestsQueryDTO) {
    return this.roleService.findMine(userId, query)
  }

  @Get()
  @IsAdmin()
  @ZodSerializerDto(GetRoleRequestsResDTO)
  findAll(@Query() query: GetRoleRequestsQueryDTO) {
    return this.roleService.findAll(query)
  }

  @Patch(':id/approve')
  @IsAdmin()
  @ZodSerializerDto(RoleRequestItemDTO)
  approve(
    @ActiveUser('userId') adminId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveRoleRequestBodyDTO,
  ) {
    return this.roleService.approve(adminId, id, body)
  }

  @Patch(':id/reject')
  @IsAdmin()
  @ZodSerializerDto(RoleRequestItemDTO)
  reject(
    @ActiveUser('userId') adminId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectRoleRequestBodyDTO,
  ) {
    return this.roleService.reject(adminId, id, body)
  }
}
