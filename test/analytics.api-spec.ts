import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AnalyticsController } from '../src/modules/analytics/controller/analytics.controller'
import { AnalyticsService } from '../src/modules/analytics/service/analytics.service'
import { createHttpTestApp } from './helpers/create-http-test-app'

describe('Analytics API', () => {
  let app: INestApplication
  const analyticsService = {
    getDashboardSummary: jest.fn(),
    getOrdersAnalytics: jest.fn(),
    getEmissionsAnalytics: jest.fn(),
    getFleetPerformance: jest.fn(),
  }

  beforeAll(async () => {
    const testApp = await createHttpTestApp({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: analyticsService }],
    })

    app = testApp.app
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /analytics/dashboard forwards a valid dateRange', async () => {
    analyticsService.getDashboardSummary.mockResolvedValue({
      totalOrders: 10,
      totalRevenue: 1000,
      totalDistance: 250,
      totalCo2Saved: 12,
      avgDeliveryTime: 3,
      onTimeDeliveryRate: 95,
    })

    await request(app.getHttpServer()).get('/analytics/dashboard?dateRange=7d').expect(200)

    expect(analyticsService.getDashboardSummary).toHaveBeenCalledWith({ dateRange: '7d' })
  })

  it('GET /analytics/dashboard rejects an unsupported dateRange', async () => {
    await request(app.getHttpServer()).get('/analytics/dashboard?dateRange=365d').expect(400)
  })
})
