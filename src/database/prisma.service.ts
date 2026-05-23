import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from 'generated/prisma'
import { Pool } from 'pg'

/**
 * Helper function to parse a string into a positive integer.
 * Hàm bổ trợ để phân tích một chuỗi thành một số nguyên dương.
 *
 * If parsing fails or the parsed value is not greater than 0, it returns the provided fallback value.
 * Nếu phân tích thất bại hoặc giá trị được phân tích không lớn hơn 0, nó sẽ trả về giá trị dự phòng được cung cấp.
 *
 * @param {string | undefined} value - The raw string value to parse.
 * @param {string | undefined} value - Giá trị chuỗi thô cần phân tích.
 * @param {number} fallback - The fallback value if parsing fails.
 * @param {number} fallback - Giá trị dự phòng nếu phân tích thất bại.
 * @returns {number} The parsed positive integer or the fallback value.
 * @returns {number} Số nguyên dương được phân tích hoặc giá trị dự phòng.
 */
function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Helper function to determine the Prisma client log levels based on the environment.
 * Hàm bổ trợ để xác định các mức độ log của Prisma client dựa trên môi trường.
 *
 * In production, it only logs 'warn' and 'error'.
 * In development, it logs 'query', 'warn', and 'error' if PRISMA_QUERY_LOG is set to '1'.
 * Trong môi trường production, nó chỉ log 'warn' và 'error'.
 * Trong môi trường development, nó log thêm 'query' nếu biến PRISMA_QUERY_LOG được đặt là '1'.
 *
 * @returns {Prisma.LogLevel[]} Array of Prisma log levels.
 * @returns {Prisma.LogLevel[]} Mảng chứa các mức độ log của Prisma.
 */
function resolvePrismaLogLevels(): Prisma.LogLevel[] {
  if (process.env.NODE_ENV === 'production') {
    return ['warn', 'error']
  }

  return process.env.PRISMA_QUERY_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error']
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
