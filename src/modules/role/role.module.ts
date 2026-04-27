import { Module } from '@nestjs/common'
import { RoleService } from './service/role.service'
import { RoleController } from './controller/role.controller'
import { RoleRepository } from './repository/role.repo'
import { PrismaService } from 'src/database/prisma.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

@Module({
  controllers: [RoleController],
  providers: [RoleService, RoleRepository, AuthRepository, PrismaService],
})
export class RoleModule {}
