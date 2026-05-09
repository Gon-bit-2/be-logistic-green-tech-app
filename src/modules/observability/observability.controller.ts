import { Controller, Get, Param, Query } from '@nestjs/common'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { ObservabilityService } from './observability.service'
import { AuditLogQueryDto, ObservabilityLimitQueryDto, ObservabilityPaginationQueryDto } from './observability.dto'

@Controller('admin/observability')
@Roles(roleName.ADMIN)
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('queues')
  getQueues() {
    return this.observabilityService.getQueues()
  }

  @Get('queues/:name/failed-jobs')
  getFailedJobs(@Param('name') name: string, @Query() query: ObservabilityLimitQueryDto) {
    return this.observabilityService.getFailedJobs(name, query.limit)
  }

  @Get('slow-endpoints')
  getSlowEndpoints(@Query() query: ObservabilityPaginationQueryDto) {
    return this.observabilityService.getSlowEndpoints(query)
  }

  @Get('audit-logs')
  getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.observabilityService.getAuditLogs(query)
  }
}
