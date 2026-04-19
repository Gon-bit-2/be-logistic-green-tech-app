import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from 'generated/prisma'
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    super({
      adapter,
      errorFormat: 'minimal',
      log: ['info'],
    })
  }
  async onModuleInit() {
    await this.$connect()
  }
}
