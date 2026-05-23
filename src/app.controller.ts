import { Controller, Get } from '@nestjs/common'
import { isPublic } from '@src/common/decorators/auth.decorator'
import { AppService } from '@src/app.service'

/**
 * Root controller of the application, handles basic health checks and landing endpoints.
 * Controller gốc của ứng dụng, xử lý các endpoint cơ bản như kiểm tra trạng thái hoạt động (health check).
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Root endpoint returning a greeting message.
   * Endpoint gốc trả về thông điệp chào mừng.
   *
   * @returns {string} Welcome greeting message.
   * @returns {string} Thông điệp chào mừng.
   */
  @Get()
  @isPublic()
  getHello(): string {
    return this.appService.getHello()
  }

  /**
   * Health check endpoint for monitoring, load balancers, and deployment readiness.
   * Health check endpoint cho monitoring, load balancer và deployment readiness.
   *
   * Returns basic server status: status, uptime, memory usage.
   * Trả về trạng thái cơ bản của server: status, uptime, memory usage.
   * Public endpoint — no authentication required.
   * Public endpoint — không cần auth (load balancer cần gọi được liên tục).
   *
   * @returns Object containing status, timestamp, uptime, and memory usage.
   * @returns Đối tượng chứa status, timestamp, uptime và mức sử dụng bộ nhớ.
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
