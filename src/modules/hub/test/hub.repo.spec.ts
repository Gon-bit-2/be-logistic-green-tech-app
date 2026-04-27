import { HubRepository } from '../repository/hub.repo'
import { PrismaService } from 'src/database/prisma.service'

describe('HubRepository', () => {
  let repository: HubRepository
  let prismaService: {
    hub: {
      findMany: jest.Mock
      count: jest.Mock
    }
  }

  beforeEach(() => {
    prismaService = {
      hub: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    }

    repository = new HubRepository(prismaService as unknown as PrismaService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('always filters inactive and soft-deleted hubs in findAll', async () => {
    await repository.findAll({ page: 1, limit: 10, search: 'sgn' } as any)

    const expectedWhere = {
      deletedAt: null,
      isActive: true,
      name: { contains: 'sgn', mode: 'insensitive' },
    }

    expect(prismaService.hub.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      skip: 0,
      take: 10,
      orderBy: { id: 'asc' },
    })
    expect(prismaService.hub.count).toHaveBeenCalledWith({ where: expectedWhere })
  })
})
