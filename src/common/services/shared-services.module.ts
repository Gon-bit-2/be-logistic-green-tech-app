import { Module } from '@nestjs/common'
import { NotificationEmitterService } from './notification-emitter.service'
import { CodSettlementService } from './cod-settlement.service'
import { OrderStateService } from './order-state.service'
import { AuditLogService } from './audit-log.service'
import { DatabaseModule } from 'src/database/database.module'

/**
 * Module cung cấp các service dùng chung cho những feature module cần phối hợp
 * notification, COD settlement hoặc order state transition.
 */
@Module({
  imports: [DatabaseModule],
  providers: [NotificationEmitterService, CodSettlementService, OrderStateService, AuditLogService],
  exports: [NotificationEmitterService, CodSettlementService, OrderStateService, AuditLogService],
})
export class SharedServicesModule {}
