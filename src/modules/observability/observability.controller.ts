import { Controller, Get, Param, Query } from '@nestjs/common'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { ObservabilityService } from './observability.service'
import { AuditLogQueryDto, ObservabilityLimitQueryDto, ObservabilityPaginationQueryDto } from './observability.dto'

/**
 * Controller for system observability and monitoring, accessible only by Administrators.
 * Provides endpoints for checking queue status, viewing failed queue jobs, tracking slow API endpoints, and retrieving audit logs.
 * 
 * Controller quản lý khả năng giám sát và đo lường hệ thống (Observability), chỉ quản trị viên (Admin) mới có quyền truy cập.
 * Cung cấp các endpoint để kiểm tra trạng thái hàng đợi, xem các công việc bị lỗi trong hàng đợi, theo dõi các endpoint API phản hồi chậm và truy xuất nhật ký kiểm toán.
 */
@Controller('admin/observability')
@Roles(roleName.ADMIN)
export class ObservabilityController {
  /**
   * Initializes the ObservabilityController.
   * 
   * Khởi tạo ObservabilityController.
   * 
   * @param observabilityService - The Observability service instance / Instance của dịch vụ giám sát.
   */
  constructor(private readonly observabilityService: ObservabilityService) {}

  /**
   * Retrieves overall statistics for active BullMQ queues.
   * 
   * Lấy số liệu thống kê tổng thể cho các hàng đợi (BullMQ) đang hoạt động.
   * 
   * @returns List of queues with job counts in different states / Danh sách các hàng đợi kèm theo số lượng công việc ở các trạng thái khác nhau.
   */
  @Get('queues')
  getQueues() {
    return this.observabilityService.getQueues()
  }

  /**
   * Retrieves a list of failed jobs for a specific queue.
   * 
   * Lấy danh sách các công việc bị lỗi trong một hàng đợi cụ thể.
   * 
   * @param name - The queue name / Tên của hàng đợi.
   * @param query - Query parameter to limit the number of returned failed jobs / Tham số truy vấn để giới hạn số lượng công việc lỗi trả về.
   * @returns Detailed list of failed jobs including error stack traces / Danh sách chi tiết các công việc bị lỗi bao gồm cả stack trace lỗi.
   */
  @Get('queues/:name/failed-jobs')
  getFailedJobs(@Param('name') name: string, @Query() query: ObservabilityLimitQueryDto) {
    return this.observabilityService.getFailedJobs(name, query.limit)
  }

  /**
   * Retrieves endpoints that took the longest time to respond.
   * 
   * Lấy danh sách các endpoint phản hồi chậm nhất hệ thống.
   * 
   * @param query - Pagination and filter parameters / Các tham số phân trang và bộ lọc.
   * @returns A paginated list of slow HTTP endpoints / Danh sách các endpoint HTTP phản hồi chậm có phân trang.
   */
  @Get('slow-endpoints')
  getSlowEndpoints(@Query() query: ObservabilityPaginationQueryDto) {
    return this.observabilityService.getSlowEndpoints(query)
  }

  /**
   * Retrieves system audit logs with pagination and filters.
   * 
   * Truy xuất nhật ký kiểm toán (audit logs) của hệ thống với phân trang và bộ lọc.
   * 
   * @param query - Filtering criteria (action, actor, dates) and pagination / Tiêu chí lọc (hành động, tác nhân, ngày tháng) và phân trang.
   * @returns A paginated list of audit logs / Danh sách nhật ký kiểm toán có phân trang.
   */
  @Get('audit-logs')
  getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.observabilityService.getAuditLogs(query)
  }
}
