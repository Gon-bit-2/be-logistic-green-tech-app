import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app.module'
import helmet from 'helmet'
import { ZodValidationPipe, ZodSerializerInterceptor } from 'nestjs-zod'
import envConfig from './config/config'
import { parseCorsOrigins } from './common/utils/cors.util'

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.use(helmet())
  app.enableCors({
    origin: parseCorsOrigins(envConfig.CORS_ORIGINS) ?? ['http://localhost:3000'],
    credentials: true,
  })
  app.useGlobalPipes(new ZodValidationPipe())
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)))
  await app.listen(process.env.PORT ?? envConfig.PORT ?? 3000)
}

if (require.main === module) {
  void bootstrap()
}
