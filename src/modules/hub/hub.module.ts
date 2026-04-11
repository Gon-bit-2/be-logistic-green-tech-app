import { Module } from '@nestjs/common'
import { HubController } from 'src/modules/hub/controller/hub.controller'
import { HubService } from 'src/modules/hub/service/hub.service'
import { HubRepository } from 'src/modules/hub/repository/hub.repo'
import { PrismaService } from 'src/database/prisma.service'
import { ShareUserRepository } from 'src/common/repositories/shared-user.repo'

@Module({
  controllers: [HubController],
  providers: [HubService, HubRepository, PrismaService, ShareUserRepository],
  exports: [HubService],
})
export class HubModule {}
