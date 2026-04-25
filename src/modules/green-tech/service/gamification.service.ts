import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../database/prisma.service'

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name)

  constructor(private readonly prisma: PrismaService) {}

  async processTripEmission(tripId: number): Promise<void> {
    // 1. Get the latest emission log for the trip
    const emissionLog = await this.prisma.tripEmissionLog.findFirst({
      where: { tripId, isLatest: true },
      include: {
        trip: {
          include: {
            ordersOnBoard: true,
          },
        },
      },
    })

    if (!emissionLog) {
      this.logger.warn(`No emission log found for trip ${tripId}`)
      return
    }

    // 2. Allocate green points based on co2Saved
    const totalCo2Saved = Number(emissionLog.co2Saved) > 0 ? Number(emissionLog.co2Saved) : 0

    if (totalCo2Saved <= 0) {
      return // No savings to gamify
    }

    // Rule: 1 kg CO2 saved = 10 Green Points
    const greenPointsEarned = Math.floor(totalCo2Saved * 10)

    // 3. Apply to Driver (We can expand this to Customers)
    const driverId = emissionLog.trip.driverId

    if (driverId) {
      await this.awardPoints(driverId, totalCo2Saved, greenPointsEarned)
    }

    // Additional logic can be added here to allocate points to customers using OrderEmissionAllocation.
  }

  private async awardPoints(userId: number, co2SavedAmount: number, points: number): Promise<void> {
    try {
      // Find or create UserGreenProfile
      let profile = await this.prisma.userGreenProfile.findUnique({
        where: { userId },
      })

      if (!profile) {
        profile = await this.prisma.userGreenProfile.create({
          data: {
            userId,
            totalCo2Saved: co2SavedAmount,
            greenPoints: points,
          },
        })
      } else {
        profile = await this.prisma.userGreenProfile.update({
          where: { userId },
          data: {
            totalCo2Saved: { increment: co2SavedAmount },
            greenPoints: { increment: points },
          },
        })
      }

      // Update Rank
      await this.updateRank(profile.userId, profile.greenPoints)

      this.logger.log(`Awarded ${points} points to user ${userId}. Total CO2 Saved: ${profile.totalCo2Saved}`)
    } catch (error) {
      this.logger.error(`Failed to award points to user ${userId}:`, error.message)
    }
  }

  private async updateRank(userId: number, points: number): Promise<void> {
    let rank: 'SEED' | 'LEAF' | 'TREE' | 'FOREST' | 'EARTH_GUARDIAN' = 'SEED'

    if (points >= 10000) rank = 'EARTH_GUARDIAN'
    else if (points >= 5000) rank = 'FOREST'
    else if (points >= 2000) rank = 'TREE'
    else if (points >= 500) rank = 'LEAF'

    await this.prisma.userGreenProfile.update({
      where: { userId },
      data: { rank },
    })
  }

  // Lấy Profile Gamification của User
  async getProfile(userId: number) {
    let profile = await this.prisma.userGreenProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { fullName: true, avatar: true } },
      },
    })

    // Tạo cấu hình mặc định (SEED) nếu chưa tham gia hệ thống
    if (!profile) {
      profile = await this.prisma.userGreenProfile.create({
        data: { userId },
        include: {
          user: { select: { fullName: true, avatar: true } },
        },
      })
    }

    // Tính khoảng cách tới Next Rank
    const nextRankMilestone = this.calculateNextRank(profile.greenPoints)

    return {
      profile,
      nextRankMilestone,
    }
  }

  // Lấy Bảng Xếp Hạng Gamification
  async getLeaderboard(limit = 10) {
    return this.prisma.userGreenProfile.findMany({
      orderBy: [{ greenPoints: 'desc' }, { totalCo2Saved: 'desc' }],
      take: limit,
      include: {
        user: { select: { id: true, fullName: true, avatar: true } },
      },
    })
  }

  private calculateNextRank(currentPoints: number) {
    if (currentPoints < 500) return { max: 500, nextRank: 'LEAF' }
    if (currentPoints < 2000) return { max: 2000, nextRank: 'TREE' }
    if (currentPoints < 5000) return { max: 5000, nextRank: 'FOREST' }
    if (currentPoints < 10000) return { max: 10000, nextRank: 'EARTH_GUARDIAN' }
    return null // Đã đạt cấp cao nhất
  }
}
