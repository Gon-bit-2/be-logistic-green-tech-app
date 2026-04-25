import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app.module'
import helmet from 'helmet'
import { ZodValidationPipe, ZodSerializerInterceptor } from 'nestjs-zod'

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.use(helmet())
  app.enableCors()
  app.useGlobalPipes(new ZodValidationPipe())
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)))
  await app.listen(process.env.PORT ?? 3000)
}

if (require.main === module) {
  void bootstrap()
}
