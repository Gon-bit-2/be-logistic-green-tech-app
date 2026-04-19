import { Injectable } from '@nestjs/common'
import { AnalyticsRepository } from '../repository/analytics.repo'
import { GetAnalyticsQueryType } from '../model/analytics.model'

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async getDashboardSummary(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getDashboardSummary(query)
  }

  async getOrdersAnalytics(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getOrdersAnalytics(query)
  }

  async getEmissionsAnalytics(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getEmissionsAnalytics(query)
  }

  async getFleetPerformance(query: GetAnalyticsQueryType) {
    return this.analyticsRepository.getFleetPerformance(query)
  }
}
