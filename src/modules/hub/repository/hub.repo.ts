import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import {
  CreateHubBodyType,
  GetAllHubsQueryType,
  GetHubAssignableUsersQueryType,
  UpdateHubBodyType,
} from 'src/modules/hub/model/hub.model'

@Injectable()
export class HubRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateHubBodyType) {
    return await this.prisma.hub.create({ data })
  }

  async findAll(query: GetAllHubsQueryType) {
    const { page, limit, search } = query
    const skip = (page - 1) * limit

    const where = {
      deletedAt: null,
      isActive: true,
      ...(search && {
        name: { contains: search, mode: 'insensitive' as const },
      }),
    }

    const [data, totalItems] = await Promise.all([
      this.prisma.hub.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.prisma.hub.count({ where }),
    ])

    return { data, totalItems }
  }

  async findById(id: number) {
    const hub = await this.prisma.hub.findUnique({
      where: { id },
      include: {
        _count: { select: { vehicles: true } },
      },
    })

    if (!hub) return null

    const members = await this.prisma.user.findMany({
      where: {
        hubId: id,
        deletedAt: null,
        isDeleted: false,
        role: { name: { in: ['WAREHOUSE_STAFF', 'DRIVER'] } },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        hubId: true,
        roleId: true,
        role: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
    })

    return {
      ...hub,
      staff: members.filter((member) => member.role.name === 'WAREHOUSE_STAFF'),
      drivers: members.filter((member) => member.role.name === 'DRIVER'),
    }
  }

  async findByCode(code: string) {
    return await this.prisma.hub.findUnique({ where: { code } })
  }

  async update(id: number, data: UpdateHubBodyType) {
    return await this.prisma.hub.update({ where: { id }, data })
  }

  async delete(id: number, deletedById: number) {
    return await this.prisma.hub.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        deletedById,
      },
    })
  }

  async assignStaff(hubId: number, userId: number) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { hubId },
    })
  }

  async removeStaff(userId: number) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { hubId: null },
    })
  }

  async assignDriver(hubId: number, userId: number) {
    return await this.assignStaff(hubId, userId)
  }

  async removeDriver(userId: number) {
    return await this.removeStaff(userId)
  }

  async findAssignableUsers(hubId: number, query: GetHubAssignableUsersQueryType) {
    const search = query.search?.trim()

    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isDeleted: false,
        role: { name: query.role },
        OR: [{ hubId }, { hubId: null }],
        ...(search
          ? {
              AND: [
                {
                  OR: [
                    { fullName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        hubId: true,
        role: { select: { name: true } },
      },
      orderBy: [{ hubId: 'desc' }, { fullName: 'asc' }, { id: 'asc' }],
      take: 100,
    })
  }
}
