import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '../../generated/prisma'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      log: ['info'],
    })
  }
  async onModuleInit() {
    await this.$connect()
  }
}
