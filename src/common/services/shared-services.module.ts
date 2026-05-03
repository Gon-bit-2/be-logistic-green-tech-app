import { Global, Module } from '@nestjs/common'
import { NotificationEmitterService } from './notification-emitter.service'

/**
 * Module global cung cấp NotificationEmitterService cho toàn bộ ứng dụng.
 * Được đăng ký @Global() để mọi module đều inject được mà không cần import riêng.
 */
@Global()
@Module({
  providers: [NotificationEmitterService],
  exports: [NotificationEmitterService],
})
export class SharedServicesModule {}
