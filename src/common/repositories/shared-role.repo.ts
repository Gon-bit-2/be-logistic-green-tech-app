import { Injectable } from '@nestjs/common'
import roleName from 'src/shared/constants/role.constant'
import { PrismaService } from 'src/shared/service/prisma.service'
import { RoleType } from '../model/share-role.model'

@Injectable()
export class SharedRoleRepository {
  private clientRoleId: number | null = null
  private adminRoleId: number | null = null
  constructor(private readonly prismaService: PrismaService) {}
  private async getRole(roleName: string) {
    const role: RoleType = await this.prismaService
      .$queryRaw`SELECT * FROM "Role" WHERE name=${roleName} AND "deletedAt"IS NULL LIMIT 1`.then((res: RoleType[]) => {
      if (res.length === 0) {
        throw new Error('Role not found')
      }
      return res[0]
    })
    return role
  }
  async getClientRoleId() {
    if (this.clientRoleId) {
      return this.clientRoleId
    }

    const role: RoleType = await this.getRole(roleName.Client)
    this.clientRoleId = role.id
    return role.id
  }
  async getAdminRoleId() {
    if (this.adminRoleId) {
      return this.adminRoleId
    }

    const role: RoleType = await this.getRole(roleName.Admin)
    this.adminRoleId = role.id
    return role.id
  }
}
