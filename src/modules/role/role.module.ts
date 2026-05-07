import { Module } from '@nestjs/common'
import { RoleService } from './service/role.service'
import { RoleController } from './controller/role.controller'
import { RoleRepository } from './repository/role.repo'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { DatabaseModule } from 'src/database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [RoleController],
  providers: [RoleService, RoleRepository, AuthRepository],
})
export class RoleModule {}
