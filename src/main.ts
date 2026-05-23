import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app.module'
import helmet from 'helmet'
import { ZodValidationPipe, ZodSerializerInterceptor, cleanupOpenApiDoc } from 'nestjs-zod'
import envConfig from './config/config'
import { parseCorsOrigins } from './common/utils/cors.util'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

/**
 * Starts and configures the NestJS application backend.
 * Khởi động và cấu hình ứng dụng backend NestJS.
 *
 * This function performs the following steps:
 * Hàm này thực hiện các bước sau:
 * 1. Creates the Nest application instance with raw body enabled (for Stripe webhooks).
 *    Khởi tạo instance ứng dụng Nest với raw body (phục vụ Stripe webhook).
 * 2. Secures the app by setting various HTTP headers via Helmet middleware.
 *    Bảo mật ứng dụng bằng cách thiết lập các HTTP header thông qua middleware Helmet.
 * 3. Configures CORS using values from environment variables or defaulting to localhost.
 *    Cấu hình CORS sử dụng các giá trị từ biến môi trường hoặc mặc định là localhost.
 * 4. Registers Zod global validation pipes and serialization interceptors.
 *    Đăng ký global validation pipe và serialization interceptor sử dụng Zod.
 * 5. Sets up Swagger API documentation available at the `/docs` endpoint.
 *    Thiết lập tài liệu Swagger API khả dụng tại endpoint `/docs`.
 * 6. Starts listening on the configured PORT (default: 3000).
 *    Bắt đầu lắng nghe trên cổng PORT được cấu hình (mặc định: 3000).
 *
 * @returns {Promise<void>} Resolves when the application has successfully started.
 * @returns {Promise<void>} Trả về Promise hoàn thành khi ứng dụng khởi động thành công.
 */
export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.use(helmet())
  app.enableCors({
    origin: parseCorsOrigins(envConfig.CORS_ORIGINS) ?? ['http://localhost:3000'],
    credentials: true,
  })
  app.useGlobalPipes(new ZodValidationPipe())
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)))

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Logistic Green Tech API')
    .setDescription('API BACKEND DOCUMENTATION')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document), {
    swaggerOptions: {
      persistAuthorization: true,
    },
  })

  await app.listen(process.env.PORT ?? envConfig.PORT ?? 3000)
}

if (require.main === module) {
  void bootstrap()
}
