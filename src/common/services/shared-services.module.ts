import { Module } from '@nestjs/common'
import { NotificationEmitterService } from './notification-emitter.service'
import { CodSettlementService } from './cod-settlement.service'
import { OrderStateService } from './order-state.service'
import { AuditLogService } from './audit-log.service'
import { DatabaseModule } from 'src/database/database.module'

/**
 * Shared services module of the application.
 * Module cung cấp các service dùng chung cho những feature module cần phối hợp.
 *
 * Configures and exports common services: `NotificationEmitterService`, `CodSettlementService`,
 * `OrderStateService`, and `AuditLogService`.
 * Cấu hình và xuất khẩu các dịch vụ dùng chung: `NotificationEmitterService`, `CodSettlementService`,
 * `OrderStateService` và `AuditLogService`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [NotificationEmitterService, CodSettlementService, OrderStateService, AuditLogService],
  exports: [NotificationEmitterService, CodSettlementService, OrderStateService, AuditLogService],
})
export class SharedServicesModule {}
