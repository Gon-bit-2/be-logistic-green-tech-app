import { Injectable } from '@nestjs/common'
import { Prisma, RoleRequestStatus } from 'generated/prisma'
import { PrismaService } from 'src/database/prisma.service'
import { GetRoleRequestsQueryType } from '../model/role.model'

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
  constructor(private readonly prisma: PrismaService) {}

  private getClient(client?: PrismaExecutor) {
    return client ?? this.prisma
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
