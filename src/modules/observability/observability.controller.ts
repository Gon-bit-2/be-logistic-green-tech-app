import { Controller, Get, Param, Query } from '@nestjs/common'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { ObservabilityService } from './observability.service'

@Controller('admin/observability')
@Roles(roleName.ADMIN)
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('queues')
  getQueues() {
    return this.observabilityService.getQueues()
  }

  @Get('queues/:name/failed-jobs')
  getFailedJobs(@Param('name') name: string, @Query('limit') limit?: string) {
    return this.observabilityService.getFailedJobs(name, limit ? Number(limit) : undefined)
  }

  @Get('slow-endpoints')
  getSlowEndpoints(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.observabilityService.getSlowEndpoints({
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    })
  }

  @Get('audit-logs')
  getAuditLogs(@Query('page') page?: string, @Query('limit') limit?: string, @Query('entityType') entityType?: string) {
    return this.observabilityService.getAuditLogs({
      entityType,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    })
  }
}
