import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/service/auth.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);
  try {
    await authService.login({ email: "random@test.com", password: "password", ip: "127.0.0.1", userAgent: "test" });
  } catch (e: any) {
    console.error("EXPECTED ERROR:", e);
  }
  await app.close();
}
bootstrap();
