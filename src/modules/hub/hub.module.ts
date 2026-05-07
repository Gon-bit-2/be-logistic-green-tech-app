import { Module } from '@nestjs/common'
import { HubController } from 'src/modules/hub/controller/hub.controller'
import { HubService } from 'src/modules/hub/service/hub.service'
import { HubRepository } from 'src/modules/hub/repository/hub.repo'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { DatabaseModule } from 'src/database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [HubController],
  providers: [HubService, HubRepository, AuthRepository],
  exports: [HubService],
})
export class HubModule {}
