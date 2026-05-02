import { Module } from '@nestjs/common'
import { LanguageService } from 'src/modules/language/service/language.service'
import { LanguageController } from 'src/modules/language/controller/language.controller'
import { LanguageRepository } from 'src/modules/language/repository/language.repository'

@Module({
  controllers: [LanguageController],
  providers: [LanguageService, LanguageRepository],
})
export class LanguageModule {}
