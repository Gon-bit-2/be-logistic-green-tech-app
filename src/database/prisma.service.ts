import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from 'generated/prisma'
import { Pool } from 'pg'

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function resolvePrismaLogLevels(): Prisma.LogLevel[] {
  if (process.env.NODE_ENV === 'production') {
    return ['warn', 'error']
  }

  return process.env.PRISMA_QUERY_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error']
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      idleTimeoutMillis: parsePositiveInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30_000),
      max: parsePositiveInt(process.env.DB_POOL_MAX, 10),
    })
    const adapter = new PrismaPg(pool)
    super({
      adapter,
      log: resolvePrismaLogLevels(),
    })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
