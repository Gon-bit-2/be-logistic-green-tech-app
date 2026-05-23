import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../database/prisma.service'

/**
 * Service managing gamified reward mechanics for eco-friendly actions (CO2 savings).
 * Awards green points to drivers, processes rank promotions, and manages active leaderboard standings.
 * 
 * Dịch vụ quản lý các cơ chế phần thưởng trò chơi hóa cho các hành động thân thiện với môi trường (tiết kiệm CO2).
 * Tặng điểm thưởng xanh cho tài xế, xử lý thăng hạng cấp bậc và quản lý vị trí bảng xếp hạng hiện tại.
 */
@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name)

  /**
   * Initializes the GamificationService.
   * 
   * Khởi tạo GamificationService.
   * 
   * @param prisma - Prisma database service / Dịch vụ cơ sở dữ liệu Prisma.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Processes a completed trip emission log to calculate and award green points.
   * 
   * Xử lý bản ghi phát thải carbon của chuyến đi đã hoàn tất để tính toán và tặng điểm xanh.
   * 
   * @param tripId - Trip ID / ID chuyến đi.
   */
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

  /**
   * Awards calculated green points and increments total CO2 savings inside user's green profile.
   * 
   * Tặng điểm thưởng xanh đã tính toán và tích lũy tổng số lượng CO2 tiết kiệm được vào hồ sơ xanh của người dùng.
   * 
   * @param userId - Driver/Customer User ID / ID người dùng của tài xế/khách hàng.
   * @param co2SavedAmount - Amount of CO2 saved / Số lượng CO2 tiết kiệm được.
   * @param points - Points to award / Số điểm xanh được tặng.
   */
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

  /**
   * Evaluates current points and updates user rank level if milestones are met.
   * 
   * Đánh giá số điểm hiện tại và cập nhật cấp bậc người dùng nếu đạt các mốc cột mốc.
   * 
   * @param userId - User ID / ID người dùng.
   * @param points - Current accumulated points / Số điểm tích lũy hiện tại.
   */
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

  /**
   * Retrieves or initializes the gamification profile for a specific user ID.
   * Calculates requirements for next rank milestone.
   * 
   * Lấy hoặc khởi tạo hồ sơ trò chơi hóa cho một ID người dùng cụ thể.
   * Tính toán các yêu cầu cho cột mốc thăng hạng tiếp theo.
   * 
   * @param userId - User ID / ID người dùng.
   * @returns Detailed gamification profile and next rank milestone information / Hồ sơ trò chơi hóa chi tiết và thông tin cột mốc thăng hạng tiếp theo.
   */
  async getProfile(userId: number) {
    let profile = await this.prisma.userGreenProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { fullName: true, avatar: true } },
      },
    })

    // Create default profile (SEED) if not exists
    if (!profile) {
      profile = await this.prisma.userGreenProfile.create({
        data: { userId },
        include: {
          user: { select: { fullName: true, avatar: true } },
        },
      })
    }

    // Calculate distance to Next Rank
    const nextRankMilestone = this.calculateNextRank(profile.greenPoints)

    return {
      profile,
      nextRankMilestone,
    }
  }

  /**
   * Retrieves active leaderboard standings sorted by points and CO2 savings.
   * 
   * Lấy danh sách bảng xếp hạng đang hoạt động được sắp xếp theo số điểm và lượng CO2 tiết kiệm được.
   * 
   * @param limit - Max number of top records / Số lượng bản ghi tối đa.
   * @returns Leaderboard rankings / Danh sách thứ hạng bảng xếp hạng.
   */
  async getLeaderboard(limit = 10) {
    return this.prisma.userGreenProfile.findMany({
      orderBy: [{ greenPoints: 'desc' }, { totalCo2Saved: 'desc' }],
      take: limit,
      include: {
        user: { select: { id: true, fullName: true, avatar: true } },
      },
    })
  }

  /**
   * Helper that calculates target requirements for next rank.
   * 
   * Trình hỗ trợ tính toán các yêu cầu mục tiêu để thăng hạng tiếp theo.
   * 
   * @param currentPoints - Current accumulated points / Số điểm tích lũy hiện tại.
   * @returns Next rank milestone data or null if already at max level / Dữ liệu cột mốc tiếp theo hoặc null nếu đã đạt cấp cao nhất.
   */
  private calculateNextRank(currentPoints: number) {
    if (currentPoints < 500) return { max: 500, nextRank: 'LEAF' }
    if (currentPoints < 2000) return { max: 2000, nextRank: 'TREE' }
    if (currentPoints < 5000) return { max: 5000, nextRank: 'FOREST' }
    if (currentPoints < 10000) return { max: 10000, nextRank: 'EARTH_GUARDIAN' }
    return null // Already at maximum rank
  }
}
