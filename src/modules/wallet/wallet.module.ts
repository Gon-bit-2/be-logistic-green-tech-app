import { Module } from '@nestjs/common'
import { WalletController } from './controller/wallet.controller'
import { WalletService } from './service/wallet.service'
import { WalletRepository } from './repository/wallet.repo'

@Module({
  controllers: [WalletController],
  providers: [WalletService, WalletRepository],
  exports: [WalletService],
})
export class WalletModule {}
