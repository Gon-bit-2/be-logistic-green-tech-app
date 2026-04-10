import { Module } from '@nestjs/common'
import { HubTranslationController } from 'src/modules/hub/hub-translation/controller/hub-translation.controller'
import { HubTranslationService } from 'src/modules/hub/hub-translation/service/hub-translation.service'
import { HubTranslationRepository } from 'src/modules/hub/hub-translation/repository/hub-translation.repo'

@Module({
  controllers: [HubTranslationController],
  providers: [HubTranslationService, HubTranslationRepository],
})
export class HubTranslationModule {}
