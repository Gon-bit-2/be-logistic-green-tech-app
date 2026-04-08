import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { CreateHubBodyType, GetAllHubsQueryType, UpdateHubBodyType } from 'src/modules/hub/model/hub.model'

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
    return await this.prisma.hub.findUnique({
      where: { id },
      include: {
        staff: {
          where: { deletedAt: null },
          select: { id: true, fullName: true, email: true, phone: true },
        },
        _count: { select: { vehicles: true } },
      },
    })
  }

  async findByCode(code: string) {
    return await this.prisma.hub.findUnique({ where: { code } })
  }

  async update(id: number, data: UpdateHubBodyType) {
    return await this.prisma.hub.update({ where: { id }, data })
  }

  async delete(id: number) {
    return await this.prisma.hub.delete({ where: { id } })
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
}
