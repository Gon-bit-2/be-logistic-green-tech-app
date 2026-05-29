import { Injectable, UnauthorizedException } from '@nestjs/common'
import { UpdateProfileBodyType } from 'src/modules/auth/model/auth.model'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

@Injectable()
export class AuthProfileService {
  constructor(private readonly authRepository: AuthRepository) {}

  async getProfile(userId: number) {
    const user = await this.authRepository.findUnique({ id: userId })
    if (!user) {
      throw new UnauthorizedException('User not found')
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, totpSecret, ...profile } = user
    return profile
  }

  async updateProfile(userId: number, body: UpdateProfileBodyType) {
    const user = await this.authRepository.findUnique({ id: userId })
    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    const updatedUser = await this.authRepository.update(
      { id: userId },
      {
        ...body,
        updatedById: userId,
      },
    )

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, totpSecret, ...profile } = updatedUser
    return profile
  }
}
