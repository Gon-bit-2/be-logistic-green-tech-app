import { Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/**
 * Database module of the application.
 * Module cơ sở dữ liệu của ứng dụng.
 *
 * Configures and exports `PrismaService` globally to provide database connectivity
 * across all features and modules in the system.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
