import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import roleName from 'src/common/constants/role.constant'
import { TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { PrismaService } from 'src/database/prisma.service'
import {
  AddressBookResType,
  CreateAddressBookBodyType,
  DeviceType,
  RefreshTokenType,
  UserType,
} from 'src/modules/auth/model/auth.model'
import { PermissionType, RoleType } from 'src/modules/role/model/role.model'

type PrismaExecutor = PrismaService | Prisma.TransactionClient
export type WhereUniqueUserType = { id: number } | { email: string }
export type UserIncludeRolePermissionType = UserType & {
  role: RoleType & {
    permissions: PermissionType[]
  }
}
export type UserIncludeRoleType = UserType & {
  role: RoleType
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private getClient(client?: PrismaExecutor) {
    return client ?? this.prismaService
  }

  async findUnique(uniqueObject: WhereUniqueUserType): Promise<UserType | null> {
    return await this.prismaService.user.findFirst({
      where: {
        ...uniqueObject,
        deletedAt: null,
      },
    })
  }

  async findUniqueIncludeRolePermissions(where: WhereUniqueUserType): Promise<UserIncludeRolePermissionType | null> {
    return await this.prismaService.user.findFirst({
      where: {
        ...where,
        deletedAt: null,
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    })
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

  async update(where: { id: number }, data: Partial<UserType>) {
    const existingUser = await this.prismaService.user.findFirst({
      where: {
        id: where.id,
        deletedAt: null,
      },
      select: { id: true },
    })

    if (!existingUser) {
      throw new Error('User not found or has been deleted')
    }

    return await this.prismaService.user.update({
      where: {
        id: where.id,
      },
      data,
    })
  }

  async findActiveAdmins() {
    return await this.prismaService.user.findMany({
      where: {
        deletedAt: null,
        isDeleted: false,
        role: {
          name: roleName.ADMIN,
          deletedAt: null,
          isActive: true,
        },
      },
      select: {
        id: true,
      },
    })
  }
  async createRefreshToken(data: {
    tokenHash: string
    userId: number
    expiresAt: Date
    deviceId: number
  }): Promise<RefreshTokenType> {
    return await this.prismaService.refreshToken.create({
      data: {
        token: data.tokenHash,
        userId: data.userId,
        expiresAt: data.expiresAt,
        deviceId: data.deviceId,
      },
    })
  }
  async findUniqueRefreshTokenIncludeUserRole(uniqueObject: { tokenHash: string }) {
    return await this.prismaService.refreshToken.findUnique({
      where: {
        token: uniqueObject.tokenHash,
      },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    })
  }
  async findFirstRefreshTokenIncludeUserRoleByTokens(tokens: string[]) {
    return await this.prismaService.refreshToken.findFirst({
      where: {
        token: {
          in: tokens,
        },
      },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    })
  }
  async findFirstRefreshTokenByTokens(tokens: string[]): Promise<RefreshTokenType | null> {
    return await this.prismaService.refreshToken.findFirst({
      where: {
        token: {
          in: tokens,
        },
      },
    })
  }
  async createDevice(
    data: Pick<DeviceType, 'userId' | 'userAgent' | 'ip'> & Partial<Pick<DeviceType, 'isActive' | 'lastActive'>>,
  ): Promise<DeviceType> {
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
  async deleteRefreshToken(uniqueObject: { tokenHash: string }): Promise<RefreshTokenType> {
    return await this.prismaService.refreshToken.delete({
      where: {
        token: uniqueObject.tokenHash,
      },
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

  async findAddressBooksByUserId(userId: number): Promise<AddressBookResType[]> {
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

  async findAddressBookByIdForUser(
    id: number,
    userId: number,
    client?: PrismaExecutor,
  ): Promise<AddressBookResType | null> {
    return await this.getClient(client).addressBook.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    })
  }

  async findFirstActiveAddressBookByUserId(
    userId: number,
    client?: PrismaExecutor,
  ): Promise<AddressBookResType | null> {
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

  async createAddressBook(
    data: CreateAddressBookBodyType & { userId: number; isDefault: boolean },
    client?: PrismaExecutor,
  ): Promise<AddressBookResType> {
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
  ): Promise<AddressBookResType> {
    return await this.getClient(client).addressBook.update({
      where: {
        id,
      },
      data,
    })
  }
}
