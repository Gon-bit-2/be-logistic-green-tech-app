import { Module } from '@nestjs/common'
import { WalletController } from './controller/wallet.controller'
import { WalletService } from './service/wallet.service'
import { WalletRepository } from './repository/wallet.repo'
import { SharedServicesModule } from 'src/common/services/shared-services.module'
import { DatabaseModule } from '@src/database/database.module'

@Module({
  imports: [DatabaseModule, SharedServicesModule],
  controllers: [WalletController],
  providers: [WalletService, WalletRepository],
  exports: [WalletService],
})
export class WalletModule {}
