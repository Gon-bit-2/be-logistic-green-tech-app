import { Injectable } from '@nestjs/common'
import { TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { RoleType } from 'src/common/model/share-role.model'
import { WhereUniqueUserType } from 'src/common/repositories/shared-user.repo'
import { PrismaService } from 'src/database/prisma.service'
import { DeviceType, UserType } from 'src/modules/auth/auth.model'

@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async createUser(
    user: Pick<UserType, 'email' | 'fullName' | 'password' | 'roleId'> & { phone: string | null },
  ): Promise<Omit<UserType, 'password' | 'totpSecret'>> {
    return await this.prismaService.user.create({
      data: user,
      omit: {
        password: true,
        totpSecret: true,
      },
    })
  }
  async createUserIncludeRole(
    user: Pick<UserType, 'email' | 'fullName' | 'password' | 'roleId'> & {
      phoneNumber: string | null
      avatar: string | null
    },
  ): Promise<UserType & { role: RoleType }> {
    return await this.prismaService.user.create({
      data: user,
      include: {
        role: true,
      },
    })
  }
  async findUniqueIncludeRole(uniqueObject: WhereUniqueUserType): Promise<(UserType & { role: RoleType }) | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        ...uniqueObject,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    })
    return user
  }
  async createRefreshToken(data: { token: string; userId: number; expiresAt: Date; deviceId: number }) {
    return await this.prismaService.refreshToken.create({ data })
  }
  async findUniqueRefreshTokenIncludeUserRole(uniqueObject: { token: string }) {
    return await this.prismaService.refreshToken.findUnique({
      where: uniqueObject,
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    })
  }
  async createDevice(
    data: Pick<DeviceType, 'userId' | 'userAgent' | 'ip'> & Partial<Pick<DeviceType, 'isActive' | 'lastActive'>>,
  ) {
    return await this.prismaService.device.create({
      data,
    })
  }
  async updateDevice(deviceId: number, data: Partial<DeviceType>): Promise<DeviceType> {
    return await this.prismaService.device.update({
      where: {
        id: deviceId,
      },
      data,
    })
  }
  async deleteRefreshToken(uniqueObject: { token: string }) {
    return await this.prismaService.refreshToken.delete({
      where: uniqueObject,
    })
  }
  async findUniqueVerificationCode(uniqueObject: { email: string; code: string; type: TypeOfVerificationCodeType }) {
    const verificationCode = await this.prismaService.verificationCode.findUnique({
      where: {
        email_type: {
          email: uniqueObject.email,
          type: uniqueObject.type,
        },
      },
    })
    if (verificationCode && verificationCode.code === uniqueObject.code) {
      return verificationCode
    }
    return null
  }
}
