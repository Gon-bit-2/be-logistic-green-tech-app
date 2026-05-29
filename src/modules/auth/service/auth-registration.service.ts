import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { RegisterBodyType } from 'src/modules/auth/model/auth.model'
import { AuthOtpService } from './auth-otp.service'
import { RoleRepository } from 'src/modules/role/repository/role.repo'
import { HashingService } from 'src/common/services/hashing.service'
import { PrismaService } from 'src/database/prisma.service'
import { TypeOfVerificationCode } from 'src/common/constants/auth.constant'

@Injectable()
export class AuthRegistrationService {
  constructor(
    private readonly otpService: AuthOtpService,
    private readonly roleRepository: RoleRepository,
    private readonly hashingService: HashingService,
    private readonly prismaService: PrismaService,
  ) {}

  async register(body: RegisterBodyType) {
    try {
      await this.otpService.validateVerificationCode({
        email: body.email,
        code: body.code,
        type: TypeOfVerificationCode.REGISTER,
      })
      const clientRoleId = await this.roleRepository.getClientRoleId()
      const hashedPassword = await this.hashingService.hash(body.password)
      const [user] = await this.prismaService.$transaction([
        this.prismaService.user.create({
          data: {
            email: body.email,
            password: hashedPassword,
            fullName: body.fullName,
            phone: body.phone,
            roleId: clientRoleId,
          },
          omit: { password: true, totpSecret: true },
        }),
        this.prismaService.verificationCode.delete({
          where: {
            email_type: {
              email: body.email,
              type: TypeOfVerificationCode.REGISTER,
            },
          },
        }),
      ])
      return user
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error
      }
      if (this.hasErrorCode(error) && error.code === 'P2002') {
        throw new BadRequestException('Người Dùng Đã Tồn Tại')
      }
      throw error
    }
  }

  private hasErrorCode(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
  }
}
