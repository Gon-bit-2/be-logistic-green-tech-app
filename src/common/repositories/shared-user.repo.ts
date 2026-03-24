import { Injectable } from '@nestjs/common'
import { PermissionType } from '../model/share-permission.model'
import { RoleType } from '../model/share-role.model'
import { UserType } from 'src/common/model/shared-user.model'
import { PrismaService } from 'src/database/prisma.service'

export type WhereUniqueUserType = { id: number } | { email: string }
export type UserIncludeRolePermissionType = UserType & {
  role: RoleType & {
    permissions: PermissionType[]
  }
}
@Injectable()
export class ShareUserRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async findUnique(uniqueObject: WhereUniqueUserType) {
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
  async update(where: { id: number }, data: Partial<UserType>) {
    // Verify user exists and not deleted before updating
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
}
