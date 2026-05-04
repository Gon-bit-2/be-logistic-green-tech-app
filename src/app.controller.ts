import { Controller, Get } from '@nestjs/common'
import { isPublic } from '@src/common/decorators/auth.decorator'
import { AppService } from '@src/app.service'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @isPublic()
  getHello(): string {
    return this.appService.getHello()
  }

  /**
   * Health check endpoint cho monitoring, load balancer và deployment readiness.
   *
   * Trả về trạng thái cơ bản của server: status, uptime, memory usage.
   * Public endpoint — không cần auth (load balancer cần gọi được liên tục).
   */
  @Get('health')
  @isPublic()
  healthCheck() {
    const memoryUsage = process.memoryUsage()

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      },
    }
  }
}
