import { Module } from '@nestjs/common'
import { LanguageService } from 'src/modules/language/service/language.service'
import { LanguageController } from 'src/modules/language/controller/language.controller'
import { LanguageRepository } from 'src/modules/language/repository/language.repository'
import { PrismaService } from 'src/database/prisma.service'

@Module({
  controllers: [LanguageController],
  providers: [LanguageService, LanguageRepository, PrismaService],
})
export class LanguageModule {}
