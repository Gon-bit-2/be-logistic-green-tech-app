import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from 'src/modules/auth/auth.module'
import { VehicleModule } from 'src/modules/vehicle/vehicle.module'
import { HubModule } from 'src/modules/hub/hub.module'
import { ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerBehindProxyGuard } from 'src/common/guards/throttler-behind-proxy.guard'
import { CacheModule } from '@nestjs/cache-manager'
import { createKeyv } from '@keyv/redis'
import envConfig from 'src/config/config'
import { LanguageModule } from 'src/modules/language/language.module'
import { BullModule } from '@nestjs/bullmq'
import { TrackingModule } from 'src/modules/tracking/tracking.module'
import { GreenTechModule } from 'src/modules/green-tech/green-tech.module'
import { PaymentModule } from 'src/modules/payment/payment.module'

@Module({
  imports: [
    AuthModule,
    VehicleModule,
    HubModule,
    LanguageModule,
    TrackingModule,
    GreenTechModule,
    PaymentModule,
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
          stores: [
            createKeyv(
              `redis://${envConfig.REDIS_USERNAME}:${envConfig.REDIS_PASSWORD}@redis-12766.crce194.ap-seast-1-1.ec2.cloud.redislabs.com:${envConfig.REDIS_PORT}`,
            ),
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
  ],
})
export class AppModule {}
