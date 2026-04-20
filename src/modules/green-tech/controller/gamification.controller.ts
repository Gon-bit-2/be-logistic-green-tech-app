import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { GamificationService } from '../service/gamification.service'
import { ActiveUser } from '../../../common/decorators/active-user.decorator'

@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('profile')
  async getMyProfile(@ActiveUser('userId') userId: number) {
    return this.gamificationService.getProfile(userId)
  }

  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.gamificationService.getLeaderboard(limitNum)
  }
}
