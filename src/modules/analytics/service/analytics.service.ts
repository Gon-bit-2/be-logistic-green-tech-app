import { Injectable } from '@nestjs/common'
import { AnalyticsRepository } from '../repository/analytics.repo'
import { GetAnalyticsQueryType } from '../model/analytics.model'

/**
 * Service managing logistic operational and green technology emissions analytics.
 * 
 * Dịch vụ quản lý các phân tích vận hành logistics và lượng khí thải công nghệ xanh.
 */
@Injectable()
export class AnalyticsService {
  /**
   * Initializes the AnalyticsService.
   * 
   * Khởi tạo AnalyticsService.
   * 
   * @param analyticsRepository - Analytics Repository / Repository xử lý dữ liệu phân tích.
   */
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  /**
   * Retrieves dashboard summary metrics.
   * 
   * Lấy các chỉ số tóm tắt của dashboard.
   * 
   * @param query - Analytics filters / Các bộ lọc phân tích.
   * @returns General summary dashboard data / Dữ liệu tóm tắt dashboard chung.
   */
  async getDashboardSummary(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getDashboardSummary(query)
  }

  /**
   * Retrieves order delivery performance data.
   * 
   * Lấy dữ liệu hiệu suất giao nhận đơn hàng.
   * 
   * @param query - Analytics filters / Các bộ lọc phân tích.
   * @returns Order delivery statistics / Thống kê giao nhận đơn hàng.
   */
  async getOrdersAnalytics(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getOrdersAnalytics(query)
  }

  /**
   * Retrieves carbon emissions and sustainability savings metrics.
   * 
   * Lấy các chỉ số giảm thiểu carbon và tiết kiệm bền vững.
   * 
   * @param query - Analytics filters / Các bộ lọc phân tích.
   * @returns Carbon emission reduction statistics / Thống kê giảm thiểu khí thải carbon.
   */
  async getEmissionsAnalytics(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getEmissionsAnalytics(query)
  }

  /**
   * Retrieves vehicle fleet energy and utilization efficiency analytics.
   * 
   * Lấy phân tích về hiệu suất năng lượng và mức độ sử dụng của đội xe.
   * 
   * @param query - Analytics filters / Các bộ lọc phân tích.
   * @returns Fleet operational metrics / Chỉ số vận hành của đội xe.
   */
  async getFleetPerformance(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getFleetPerformance(query)
  }

  /**
   * Retrieves SLA compliance alerts and resolution ratios.
   * 
   * Lấy tỷ lệ giải quyết và các cảnh báo tuân thủ SLA.
   * 
   * @param query - Analytics filters / Các bộ lọc phân tích.
   * @returns SLA analytics details / Chi tiết phân tích SLA.
   */
  async getSlaAnalytics(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getSlaAnalytics(query)
  }
}
