import { Global, Module } from '@nestjs/common'
import { NotificationEmitterService } from './notification-emitter.service'
import { CodSettlementService } from './cod-settlement.service'

/**
 * Module global cung cấp NotificationEmitterService cho toàn bộ ứng dụng.
 * Được đăng ký @Global() để mọi module đều inject được mà không cần import riêng.
 */
@Global()
@Module({
  providers: [NotificationEmitterService, CodSettlementService],
  exports: [NotificationEmitterService, CodSettlementService],
})
export class SharedServicesModule {}
