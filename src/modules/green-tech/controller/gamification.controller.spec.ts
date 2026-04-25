import { Test, TestingModule } from '@nestjs/testing'
import { GamificationController } from './gamification.controller'
import { GamificationService } from '../service/gamification.service'

describe('GamificationController', () => {
  let controller: GamificationController
  let service: GamificationService

  const mockGamificationService = {
    getProfile: jest.fn(),
    getLeaderboard: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GamificationController],
      providers: [
        {
          provide: GamificationService,
          useValue: mockGamificationService,
        },
      ],
    }).compile()

    controller = module.get<GamificationController>(GamificationController)
    service = module.get<GamificationService>(GamificationService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('getMyProfile', () => {
    it('should return profile for active user', async () => {
      const mockResult = {
        profile: {
          userId: 1,
          greenPoints: 100,
          totalCo2Saved: 10,
        },
        nextRankMilestone: { max: 500, nextRank: 'LEAF' },
      }

      mockGamificationService.getProfile.mockResolvedValue(mockResult)

      const result = await controller.getMyProfile(1)

      expect(service.getProfile).toHaveBeenCalledWith(1)
      expect(result).toEqual(mockResult)
    })
  })

  describe('getLeaderboard', () => {
    it('should return leaderboard with default limit if not provided', async () => {
      const mockLeaderboard = [{ userId: 1, greenPoints: 1000 }]
      mockGamificationService.getLeaderboard.mockResolvedValue(mockLeaderboard)

      const result = await controller.getLeaderboard()

      expect(service.getLeaderboard).toHaveBeenCalledWith(10)
      expect(result).toEqual(mockLeaderboard)
    })

    it('should return leaderboard with specified limit', async () => {
      const mockLeaderboard = [{ userId: 1, greenPoints: 1000 }]
      mockGamificationService.getLeaderboard.mockResolvedValue(mockLeaderboard)

      const result = await controller.getLeaderboard('5')

      expect(service.getLeaderboard).toHaveBeenCalledWith(5)
      expect(result).toEqual(mockLeaderboard)
    })
  })
})
