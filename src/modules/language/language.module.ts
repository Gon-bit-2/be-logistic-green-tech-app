import { Module } from '@nestjs/common'
import { LanguageService } from './language.service'
import { LanguageController } from './language.controller'
import { LanguageRepository } from './repository/language.repository'
import { PrismaService } from 'src/database/prisma.service'

@Module({
  controllers: [LanguageController],
  providers: [LanguageService, LanguageRepository, PrismaService],
})
export class LanguageModule {}
