import { Test, TestingModule } from '@nestjs/testing'
import { AnalyticsService } from '../service/analytics.service'
import { AnalyticsRepository } from '../repository/analytics.repo'

describe('AnalyticsService', () => {
  let service: AnalyticsService
  let analyticsRepository: jest.Mocked<AnalyticsRepository>

  beforeEach(async () => {
    const repositoryMock = {
      getDashboardSummary: jest.fn(),
      getOrdersAnalytics: jest.fn(),
      getEmissionsAnalytics: jest.fn(),
      getFleetPerformance: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: AnalyticsRepository,
          useValue: repositoryMock,
        },
      ],
    }).compile()

    service = module.get<AnalyticsService>(AnalyticsService)
    analyticsRepository = module.get(AnalyticsRepository)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('forwards dashboard queries to the repository', async () => {
    analyticsRepository.getDashboardSummary.mockResolvedValue({ totalOrders: 1 } as any)

    const result = await service.getDashboardSummary({ dateRange: '7d' })

    expect(result).toEqual({ totalOrders: 1 })
    expect(analyticsRepository.getDashboardSummary).toHaveBeenCalledWith({ dateRange: '7d' })
  })

  it('forwards all analytics read methods to the repository', async () => {
    analyticsRepository.getOrdersAnalytics.mockResolvedValue([{ period: '2026-04', count: 1 }] as any)
    analyticsRepository.getEmissionsAnalytics.mockResolvedValue([{ period: '2026-04', co2Saved: 1 }] as any)
    analyticsRepository.getFleetPerformance.mockResolvedValue([{ vehicleId: '1' }] as any)

    await expect(service.getOrdersAnalytics({ dateRange: '30d' })).resolves.toEqual([{ period: '2026-04', count: 1 }])
    await expect(service.getEmissionsAnalytics({ dateRange: '30d' })).resolves.toEqual([
      { period: '2026-04', co2Saved: 1 },
    ])
    await expect(service.getFleetPerformance({ dateRange: '30d' })).resolves.toEqual([{ vehicleId: '1' }])
  })
})
