import { Module } from '@nestjs/common';
import { WalletController } from './controller/wallet.controller';
import { WalletService } from './service/wallet.service';
import { WalletRepository } from './repository/wallet.repo';
import { PrismaService } from 'src/database/prisma.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService, WalletRepository, PrismaService],
  exports: [WalletService]
})
export class WalletModule {}
