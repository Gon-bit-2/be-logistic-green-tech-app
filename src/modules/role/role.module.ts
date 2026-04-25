import { Module } from '@nestjs/common'
import { RoleService } from './service/role.service'
import { RoleController } from './controller/role.controller'
import { RoleRepository } from './repository/role.repo'
import { PrismaService } from 'src/database/prisma.service'
import { ShareUserRepository } from 'src/common/repositories/shared-user.repo'
import { SharedRoleRepository } from 'src/common/repositories/shared-role.repo'

@Module({
  controllers: [RoleController],
  providers: [RoleService, RoleRepository, PrismaService, ShareUserRepository, SharedRoleRepository],
})
export class RoleModule {}
