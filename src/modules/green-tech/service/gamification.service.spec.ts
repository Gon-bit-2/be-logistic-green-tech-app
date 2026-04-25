import { Test, TestingModule } from '@nestjs/testing';
import { GamificationService } from './gamification.service';
import { PrismaService } from '../../../database/prisma.service';

describe('GamificationService', () => {
  let service: GamificationService;
  let prisma: PrismaService;

  const mockPrismaService = {
    tripEmissionLog: {
      findFirst: jest.fn(),
    },
    userGreenProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamificationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<GamificationService>(GamificationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processTripEmission', () => {
    it('should warn and return if no emission log is found', async () => {
      mockPrismaService.tripEmissionLog.findFirst.mockResolvedValue(null);
      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      await service.processTripEmission(1);

      expect(loggerSpy).toHaveBeenCalledWith('No emission log found for trip 1');
      expect(mockPrismaService.userGreenProfile.findUnique).not.toHaveBeenCalled();
    });

    it('should return if co2Saved is zero or less', async () => {
      mockPrismaService.tripEmissionLog.findFirst.mockResolvedValue({
        tripId: 1,
        co2Saved: 0,
        trip: { driverId: 2, ordersOnBoard: [] },
      });

      await service.processTripEmission(1);

      expect(mockPrismaService.userGreenProfile.findUnique).not.toHaveBeenCalled();
    });

    it('should award points appropriately if co2Saved is positive and valid driver exists', async () => {
      mockPrismaService.tripEmissionLog.findFirst.mockResolvedValue({
        tripId: 1,
        co2Saved: 10.5, // 10.5 * 10 = 105 points
        trip: { driverId: 2, ordersOnBoard: [] },
      });
      
      // Simulate profile creation
      mockPrismaService.userGreenProfile.findUnique.mockResolvedValue(null);
      mockPrismaService.userGreenProfile.create.mockResolvedValue({
        userId: 2,
        totalCo2Saved: 10.5,
        greenPoints: 105,
        rank: 'SEED',
      });

      mockPrismaService.userGreenProfile.update.mockResolvedValue({
        userId: 2,
        totalCo2Saved: 10.5,
        greenPoints: 105,
        rank: 'SEED',
      });

      await service.processTripEmission(1);

      expect(mockPrismaService.userGreenProfile.findUnique).toHaveBeenCalledWith({ where: { userId: 2 } });
      expect(mockPrismaService.userGreenProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 2,
          totalCo2Saved: 10.5,
          greenPoints: 105,
        },
      });
      // Called to update the rank
      expect(mockPrismaService.userGreenProfile.update).toHaveBeenCalledWith({
        where: { userId: 2 },
        data: { rank: 'SEED' },
      });
    });

    it('should upgrade rank to LEAF if points >= 500', async () => {
      mockPrismaService.tripEmissionLog.findFirst.mockResolvedValue({
        tripId: 1,
        co2Saved: 50, // 50 * 10 = 500 points
        trip: { driverId: 2, ordersOnBoard: [] },
      });
      
      mockPrismaService.userGreenProfile.findUnique.mockResolvedValue({
        userId: 2,
        totalCo2Saved: 0,
        greenPoints: 0,
        rank: 'SEED',
      });

      mockPrismaService.userGreenProfile.update.mockResolvedValueOnce({
        userId: 2,
        totalCo2Saved: 50,
        greenPoints: 500,
        rank: 'SEED',
      }).mockResolvedValueOnce({
        userId: 2,
        totalCo2Saved: 50,
        greenPoints: 500,
        rank: 'LEAF',
      });

      await service.processTripEmission(1);

      expect(mockPrismaService.userGreenProfile.update).toHaveBeenNthCalledWith(1, {
        where: { userId: 2 },
        data: {
          totalCo2Saved: { increment: 50 },
          greenPoints: { increment: 500 },
        },
      });

      expect(mockPrismaService.userGreenProfile.update).toHaveBeenNthCalledWith(2, {
        where: { userId: 2 },
        data: { rank: 'LEAF' },
      });
    });
  });

  describe('getProfile', () => {
    it('should return existing profile and calculate next rank correctly', async () => {
      const mockProfile = {
        userId: 1,
        greenPoints: 1500,
        totalCo2Saved: 150,
        user: { fullName: 'John Doe', avatar: 'avatar.png' },
      };
      
      mockPrismaService.userGreenProfile.findUnique.mockResolvedValue(mockProfile);

      const result = await service.getProfile(1);

      expect(result).toEqual({
        profile: mockProfile,
        nextRankMilestone: { max: 2000, nextRank: 'TREE' },
      });
      expect(mockPrismaService.userGreenProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 1 },
        include: { user: { select: { fullName: true, avatar: true } } },
      });
    });

    it('should create and return a new SEED profile if the user does not have one', async () => {
      mockPrismaService.userGreenProfile.findUnique.mockResolvedValue(null);
      
      const newProfile = {
        userId: 2,
        greenPoints: 0,
        totalCo2Saved: 0,
        rank: 'SEED',
        user: { fullName: 'Jane Doe', avatar: null },
      };
      
      mockPrismaService.userGreenProfile.create.mockResolvedValue(newProfile);

      const result = await service.getProfile(2);

      expect(mockPrismaService.userGreenProfile.create).toHaveBeenCalledWith({
        data: { userId: 2 },
        include: { user: { select: { fullName: true, avatar: true } } },
      });

      expect(result).toEqual({
        profile: newProfile,
        nextRankMilestone: { max: 500, nextRank: 'LEAF' },
      });
    });
  });

  describe('getLeaderboard', () => {
    it('should return leaderboard data correctly', async () => {
      const topProfiles = [
        { greenPoints: 20000, totalCo2Saved: 2000 },
        { greenPoints: 15000, totalCo2Saved: 1500 },
      ];
      
      mockPrismaService.userGreenProfile.findMany.mockResolvedValue(topProfiles);

      const result = await service.getLeaderboard(5);

      expect(mockPrismaService.userGreenProfile.findMany).toHaveBeenCalledWith({
        orderBy: [{ greenPoints: 'desc' }, { totalCo2Saved: 'desc' }],
        take: 5,
        include: {
          user: { select: { id: true, fullName: true, avatar: true } },
        },
      });
      
      expect(result).toEqual(topProfiles);
    });
  });
});
