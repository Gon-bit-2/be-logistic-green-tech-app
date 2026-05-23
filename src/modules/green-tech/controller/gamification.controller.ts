import { Controller, Get, Query } from '@nestjs/common'
import { GamificationService } from '../service/gamification.service'
import { ActiveUser } from '../../../common/decorators/active-user.decorator'

/**
 * Controller for managing green tech gamification profiles, driver points, and leaderboard standings.
 * 
 * Controller quản lý hồ sơ trò chơi hóa công nghệ xanh, điểm thưởng tài xế và thứ hạng trên bảng xếp hạng.
 */
@Controller('gamification')
export class GamificationController {
  /**
   * Initializes the GamificationController.
   * 
   * Khởi tạo GamificationController.
   * 
   * @param gamificationService - The Gamification service instance / Instance của dịch vụ trò chơi hóa.
   */
  constructor(private readonly gamificationService: GamificationService) {}

  /**
   * Retrieves the gamification profile of the currently logged-in driver.
   * Includes their total points, badge level, and active missions.
   * 
   * Lấy hồ sơ trò chơi hóa của tài xế đang đăng nhập.
   * Bao gồm tổng số điểm tích lũy, cấp độ huy hiệu và các nhiệm vụ đang hoạt động.
   * 
   * @param userId - Active user ID / ID người dùng đang đăng nhập.
   * @returns Driver gamification profile details / Chi tiết hồ sơ trò chơi hóa của tài xế.
   */
  @Get('profile')
  async getMyProfile(@ActiveUser('userId') userId: number) {
    return this.gamificationService.getProfile(userId)
  }

  /**
   * Retrieves top performing driver rankings (leaderboard).
   * 
   * Lấy danh sách bảng xếp hạng các tài xế đạt hiệu suất xanh cao nhất.
   * 
   * @param limit - Optional maximum number of rows to retrieve / Giới hạn số lượng tài xế tối đa cần lấy tùy chọn.
   * @returns Current leaderboard standings / Thứ hạng bảng xếp hạng hiện tại.
   */
  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.gamificationService.getLeaderboard(limitNum)
  }
}
