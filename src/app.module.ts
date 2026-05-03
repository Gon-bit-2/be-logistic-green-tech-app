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
import { EventEmitterModule } from '@nestjs/event-emitter'
import { DatabaseModule } from './database/database.module'
import { LoggingMiddleware } from './common/middlewares/logging.middleware'
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware'
import { SharedServicesModule } from './common/services/shared-services.module'

function buildRedisUrl() {
  if (envConfig.REDIS_URL) {
    return envConfig.REDIS_URL
  }

  const auth =
    envConfig.REDIS_USERNAME || envConfig.REDIS_PASSWORD
      ? `${encodeURIComponent(envConfig.REDIS_USERNAME)}:${encodeURIComponent(envConfig.REDIS_PASSWORD)}@`
      : ''

  return `redis://${auth}${envConfig.REDIS_HOST}:${envConfig.REDIS_PORT}`
}

@Module({
  imports: [
    DatabaseModule,
    SharedServicesModule,
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
          stores: [
            createKeyv(buildRedisUrl()),
          ],
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
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, LoggingMiddleware).forRoutes('*')
  }
}
