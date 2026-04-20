import { Injectable } from '@nestjs/common'
import roleName from 'src/common/constants/role.constant'
import { PrismaService } from 'src/database/prisma.service'
import { RoleType } from '../model/share-role.model'

@Injectable()
export class SharedRoleRepository {
  private readonly roleIdCache = new Map<string, number>()
  constructor(private readonly prismaService: PrismaService) {}
  private async getRole(roleName: string) {
    const role: RoleType = await this.prismaService.$queryRaw<
      RoleType[]
    >`SELECT * FROM "roles" WHERE name=${roleName} AND "deletedAt" IS NULL LIMIT 1`.then((res) => {
      if (res.length === 0) {
        throw new Error('Role not found')
      }
      return res[0]
    })
    return role
  }
  async getRoleIdByName(name: string) {
    const cachedRoleId = this.roleIdCache.get(name)
    if (cachedRoleId) {
      return cachedRoleId
    }

    const role = await this.getRole(name)
    this.roleIdCache.set(name, role.id)
    return role.id
  }
  async getClientRoleId() {
    return this.getRoleIdByName(roleName.CUSTOMER)
  }
  async getAdminRoleId() {
    return this.getRoleIdByName(roleName.ADMIN)
  }
  async getDriverRoleId() {
    return this.getRoleIdByName(roleName.DRIVER)
  }
  async getWarehouseStaffRoleId() {
    return this.getRoleIdByName(roleName.WAREHOUSE_STAFF)
  }
}
