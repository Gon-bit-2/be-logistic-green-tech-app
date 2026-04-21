import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { RoleType } from 'src/common/model/share-role.model'
import { WhereUniqueUserType } from 'src/common/repositories/shared-user.repo'
import { PrismaService } from 'src/database/prisma.service'
import { CreateAddressBookBodyType, DeviceType, UserType } from 'src/modules/auth/model/auth.model'

type PrismaExecutor = PrismaService | Prisma.TransactionClient

@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private getClient(client?: PrismaExecutor) {
    return client ?? this.prismaService
  }

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
      phone: string | null
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

  async findAddressBooksByUserId(userId: number) {
    return await this.prismaService.addressBook.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })
  }

  async countActiveAddressBooksByUserId(userId: number) {
    return await this.prismaService.addressBook.count({
      where: {
        userId,
        deletedAt: null,
      },
    })
  }

  async findAddressBookByIdForUser(id: number, userId: number, client?: PrismaExecutor) {
    return await this.getClient(client).addressBook.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    })
  }

  async findFirstActiveAddressBookByUserId(userId: number, client?: PrismaExecutor) {
    return await this.getClient(client).addressBook.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    })
  }

  async clearDefaultAddressBooks(userId: number, excludeId?: number, client?: PrismaExecutor) {
    return await this.getClient(client).addressBook.updateMany({
      where: {
        userId,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      data: {
        isDefault: false,
      },
    })
  }

  async createAddressBook(data: CreateAddressBookBodyType & { userId: number; isDefault: boolean }, client?: PrismaExecutor) {
    return await this.getClient(client).addressBook.create({
      data: {
        ...data,
        label: data.label ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      },
    })
  }

  async updateAddressBook(
    id: number,
    data: Prisma.AddressBookUpdateInput | Prisma.AddressBookUncheckedUpdateInput,
    client?: PrismaExecutor,
  ) {
    return await this.getClient(client).addressBook.update({
      where: {
        id,
      },
      data,
    })
  }
}
