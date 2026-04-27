import { Injectable } from '@nestjs/common'
import { Prisma, RoleRequestStatus } from 'generated/prisma'
import roleName from 'src/common/constants/role.constant'
import { PrismaService } from 'src/database/prisma.service'
import { GetRoleRequestsQueryType, RoleType } from '../model/role.model'

type PrismaExecutor = PrismaService | Prisma.TransactionClient

const roleRequestDetailInclude = {
  requester: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      hubId: true,
    },
  },
  currentRole: {
    select: {
      id: true,
      name: true,
    },
  },
  targetRole: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedHub: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.RoleRequestInclude

@Injectable()
export class RoleRepository {
  private readonly roleIdCache = new Map<string, number>()

  constructor(private readonly prisma: PrismaService) {}

  private getClient(client?: PrismaExecutor) {
    return client ?? this.prisma
  }

  private async getRole(name: string) {
    const role: RoleType = await this.prisma.$queryRaw<
      RoleType[]
    >`SELECT * FROM "roles" WHERE name=${name} AND "deletedAt" IS NULL LIMIT 1`.then((res) => {
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

  async findPendingByRequesterId(requesterId: number) {
    return await this.prisma.roleRequest.findFirst({
      where: {
        requesterId,
        status: RoleRequestStatus.PENDING,
      },
    })
  }

  async createRoleRequest(
    data: {
      requesterId: number
      currentRoleId: number
      targetRoleId: number
      reason: string
      assignedHubId: number
    },
    client?: PrismaExecutor,
  ) {
    return await this.getClient(client).roleRequest.create({
      data,
      include: roleRequestDetailInclude,
    })
  }

  async findById(id: number, client?: PrismaExecutor) {
    return await this.getClient(client).roleRequest.findUnique({
      where: { id },
      include: roleRequestDetailInclude,
    })
  }

  async findManyByRequester(requesterId: number, query: GetRoleRequestsQueryType) {
    const { page, limit, status, targetRoleName } = query
    const skip = (page - 1) * limit
    const where: Prisma.RoleRequestWhereInput = {
      requesterId,
      ...(status ? { status } : {}),
      ...(targetRoleName ? { targetRole: { name: targetRoleName } } : {}),
    }

    const [data, totalItems] = await Promise.all([
      this.prisma.roleRequest.findMany({
        where,
        include: roleRequestDetailInclude,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.roleRequest.count({ where }),
    ])

    return { data, totalItems }
  }

  async findMany(query: GetRoleRequestsQueryType) {
    const { page, limit, status, targetRoleName } = query
    const skip = (page - 1) * limit
    const where: Prisma.RoleRequestWhereInput = {
      ...(status ? { status } : {}),
      ...(targetRoleName ? { targetRole: { name: targetRoleName } } : {}),
    }

    const [data, totalItems] = await Promise.all([
      this.prisma.roleRequest.findMany({
        where,
        include: roleRequestDetailInclude,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.roleRequest.count({ where }),
    ])

    return { data, totalItems }
  }

  async updateRoleRequest(
    id: number,
    data: Prisma.RoleRequestUpdateInput | Prisma.RoleRequestUncheckedUpdateInput,
    client?: PrismaExecutor,
  ) {
    return await this.getClient(client).roleRequest.update({
      where: { id },
      data,
      include: roleRequestDetailInclude,
    })
  }

  async updateUserRole(
    userId: number,
    data: {
      roleId: number
      hubId: number | null
    },
    client?: PrismaExecutor,
  ) {
    return await this.getClient(client).user.update({
      where: {
        id: userId,
      },
      data: {
        roleId: data.roleId,
        hubId: data.hubId,
      },
    })
  }

  async findActiveHubById(id: number, client?: PrismaExecutor) {
    return await this.getClient(client).hub.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
      },
    })
  }
}
