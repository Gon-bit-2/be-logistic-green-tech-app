import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from 'generated/prisma'
import { Pool } from 'pg'
import envConfig from 'src/config/config'

/**
 * Resolves Prisma log levels from validated runtime config.
 * Xác định mức log Prisma từ cấu hình runtime đã được kiểm chứng.
 */
function resolvePrismaLogLevels(): Prisma.LogLevel[] {
  if (envConfig.NODE_ENV === 'production') {
    return ['warn', 'error']
  }

  return envConfig.PRISMA_QUERY_LOG ? ['query', 'warn', 'error'] : ['warn', 'error']
}

/**
 * Database service that extends PrismaClient to manage the database connection life cycle.
 * Service cơ sở dữ liệu kế thừa từ PrismaClient để quản lý vòng đời kết nối cơ sở dữ liệu.
 *
 * Configures connection pooling using the pg library's Pool class and uses
 * an adapter to bridge Prisma and the PostgreSQL connection pool.
 * Cấu hình kết nối pool sử dụng lớp Pool của thư viện pg và sử dụng
 * một adapter để bắc cầu giữa Prisma và PostgreSQL connection pool.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const pool = new Pool({
      connectionString: envConfig.DATABASE_URL,
      idleTimeoutMillis: envConfig.DB_POOL_IDLE_TIMEOUT_MS,
      max: envConfig.DB_POOL_MAX,
    })
    const adapter = new PrismaPg(pool)
    super({
      adapter,
      log: resolvePrismaLogLevels(),
    })
  }

  /**
   * Lifecycle hook called when the module has been initialized.
   * Hook vòng đời được gọi khi module đã được khởi tạo.
   *
   * Establishes the database connection.
   * Thiết lập kết nối đến cơ sở dữ liệu.
   *
   * @returns {Promise<void>} Resolves when connection is established.
   * @returns {Promise<void>} Trả về Promise hoàn thành khi kết nối được thiết lập.
   */
  async onModuleInit() {
    await this.$connect()
  }

  /**
   * Lifecycle hook called when the module is being destroyed.
   * Hook vòng đời được gọi khi module đang bị hủy.
   *
   * Closes the database connection.
   * Đóng kết nối cơ sở dữ liệu.
   *
   * @returns {Promise<void>} Resolves when connection is closed.
   * @returns {Promise<void>} Trả về Promise hoàn thành khi kết nối được đóng.
   */
  async onModuleDestroy() {
    await this.$disconnect()
  }
}
