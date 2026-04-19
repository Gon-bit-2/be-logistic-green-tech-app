import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { isPublic } from './common/decorators/auth.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @isPublic()
  getHello(): string {
    return this.appService.getHello();
  }
}
