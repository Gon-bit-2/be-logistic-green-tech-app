import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from 'src/modules/auth/auth.module'
import { VehicleModule } from 'src/modules/vehicle/vehicle.module'
import { HubModule } from 'src/modules/hub/hub.module'
import { ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD, APP_FILTER } from '@nestjs/core'
import { ThrottlerBehindProxyGuard } from 'src/common/guards/throttler-behind-proxy.guard'
import { CacheModule } from '@nestjs/cache-manager'
import { createKeyv } from '@keyv/redis'
import envConfig from 'src/config/config'
import { LanguageModule } from 'src/modules/language/language.module'
import { BullModule } from '@nestjs/bullmq'
import { TrackingModule } from 'src/modules/tracking/tracking.module'
import { GreenTechModule } from 'src/modules/green-tech/green-tech.module'
import { PaymentModule } from 'src/modules/payment/payment.module'
import { OrdersModule } from 'src/modules/orders/orders.module'
import { AppAccessGuard } from 'src/common/guards/app-access.guard'
import { AllExceptionsFilter } from 'src/common/filters/all-exceptions.filter'
import { AnalyticsModule } from 'src/modules/analytics/analytics.module'
import { TripsModule } from './modules/trips/trips.module'
import { WalletModule } from './modules/wallet/wallet.module'
import { UploadModule } from './modules/upload/upload.module'
import { NotificationModule } from './modules/notification/notification.module'
import { RoleModule } from './modules/role/role.module'
import { MapsModule } from './modules/maps/maps.module'
import { ObservabilityModule } from './modules/observability/observability.module'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { LoggingMiddleware } from './common/middlewares/logging.middleware'
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware'
import { buildRedisUrl } from './common/utils/buildRedisUrl.util'

/**
 * Root module of the application.
 * Module gốc của ứng dụng.
 *
 * Imports all feature modules, sets up global providers, and configures external services
 * like Throttler, BullMQ, Redis-based Cache Manager, and event emitters.
 * Nhập tất cả các module tính năng, thiết lập global providers và cấu hình các dịch vụ bên ngoài
 * như Throttler, BullMQ, Cache Manager dựa trên Redis và event emitters.
 */
@Module({
  imports: [
    AuthModule,
    VehicleModule,
    HubModule,
    LanguageModule,
    TrackingModule,
    GreenTechModule,
    PaymentModule,
    OrdersModule,
    TripsModule,
    WalletModule,
    UploadModule,
    AnalyticsModule,
    NotificationModule,
    RoleModule,
    MapsModule,
    ObservabilityModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 100,
        },
      ],
    }),
    BullModule.forRoot({
      connection: {
        host: envConfig.REDIS_HOST,
        port: envConfig.REDIS_PORT,
        username: envConfig.REDIS_USERNAME,
        password: envConfig.REDIS_PASSWORD,
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        return {
          ttl: 60_000,
          stores: [createKeyv(buildRedisUrl())],
        }
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: AppAccessGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Configures global middlewares for the application.
   * Cấu hình các middleware toàn cục cho ứng dụng.
   *
   * Applies `RequestIdMiddleware` and `LoggingMiddleware` to all routes.
   * Áp dụng `RequestIdMiddleware` và `LoggingMiddleware` cho tất cả các tuyến đường (routes).
   *
   * @param {MiddlewareConsumer} consumer - NestJS middleware consumer to apply middlewares.
   * @param {MiddlewareConsumer} consumer - Bộ tiêu thụ middleware NestJS để áp dụng các middleware.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, LoggingMiddleware).forRoutes('*')
  }
}
