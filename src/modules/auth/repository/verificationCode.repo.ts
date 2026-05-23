import { Injectable } from '@nestjs/common'
import { TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { PrismaService } from 'src/database/prisma.service'
import { VerificationCodeType } from 'src/modules/auth/model/auth.model'

/**
 * Repository class handling database queries related to OTP verification codes.
 * Lớp Repository xử lý các truy vấn cơ sở dữ liệu liên quan đến mã xác thực OTP.
 */
@Injectable()
export class VerificationCodeRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Upserts an OTP verification code. If a code already exists for the email and type, it is updated.
   * Thêm mới hoặc cập nhật mã xác thực OTP. Nếu mã đã tồn tại đối với email và loại hành động, nó sẽ được cập nhật.
   *
   * @param payload - OTP details (email, code, type, expiresAt).
   * @returns {Promise<VerificationCodeType>} The created or updated verification code record.
   */
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

  /**
   * Finds a unique active verification code by id or email-type combination.
   * Tìm một mã xác thực duy nhất đang hoạt động bằng ID hoặc tổ hợp email-type.
   *
   * @param uniqueValue - The query unique filter.
   * @returns {Promise<VerificationCodeType | null>} The verification code or null if not found.
   */
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

  /**
   * Deletes a verification code record from the database.
   * Xóa một bản ghi mã xác thực khỏi cơ sở dữ liệu.
   *
   * @param where - Unique identifier of the record to delete.
   * @returns {Promise<VerificationCodeType>} The deleted verification code record.
   */
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
