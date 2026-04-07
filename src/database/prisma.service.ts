import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '../../generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    super({
      adapter,
      log: ['info'],
    })
  }
  async onModuleInit() {
    await this.$connect()
  }
}
