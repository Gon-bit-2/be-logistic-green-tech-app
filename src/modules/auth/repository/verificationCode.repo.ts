import { Injectable } from '@nestjs/common'
import { TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { PrismaService } from 'src/database/prisma.service'
import { VerificationCodeType } from 'src/modules/auth/model/auth.model'

@Injectable()
export class VerificationCodeRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async createVerificationCode(
    payload: Pick<VerificationCodeType, 'email' | 'type' | 'code' | 'expiresAt'>,
  ): Promise<VerificationCodeType> {
    return this.prismaService.verificationCode.upsert({
      where: {
        email_type: {
          email: payload.email,
          type: payload.type,
        },
      },
      create: payload,
      update: {
        code: payload.code,
        expiresAt: payload.expiresAt,
      },
    })
  }
  async findUniqueVerificationCode(
    uniqueValue:
      | { id: number }
      | {
          email_type: { email: string; type: TypeOfVerificationCodeType }
        },
  ): Promise<VerificationCodeType | null> {
    return await this.prismaService.verificationCode.findUnique({
      where: uniqueValue,
    })
  }
  async deleteVerificationCode(
    where:
      | { id: number }
      | {
          email_type: { email: string; type: TypeOfVerificationCodeType }
        },
  ): Promise<VerificationCodeType> {
    return await this.prismaService.verificationCode.delete({
      where,
    })
  }
}
