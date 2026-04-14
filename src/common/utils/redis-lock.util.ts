import { Logger } from '@nestjs/common'
import { Redis } from 'ioredis'

const logger = new Logger('RedisLock')

/**
 * Distributed Lock sử dụng Redis SETNX pattern.
 * Đảm bảo chỉ có DUY NHẤT 1 worker xử lý cùng 1 resource (ví dụ: hubId) tại một thời điểm.
 *
 * Flow:
 * 1. Thử SET key với NX (chỉ set nếu key chưa tồn tại) + TTL tự hủy.
 * 2. Nếu SET thành công → Lấy được lock → chạy logic.
 * 3. Nếu SET thất bại → Lock đã bị worker khác giữ → skip hoặc retry.
 * 4. Sau khi xong, xóa key để giải phóng lock.
 *
 * TTL đóng vai trò Safety Net: Nếu worker crash mà không kịp xóa key,
 * lock sẽ tự hết hạn sau TTL giây, tránh deadlock vĩnh viễn.
 */

const DEFAULT_LOCK_TTL_SECONDS = 300 // 5 phút (đủ cho thuật toán Bin Packing + Routing)
const LOCK_PREFIX = 'dispatch-lock'

/**
 * Thử lấy Distributed Lock cho một resource (hubId).
 * @returns lockValue (UUID) nếu lấy được lock, null nếu resource đang bị lock bởi worker khác.
 */
export async function acquireLock(
  redis: Redis,
  resourceId: string,
  ttlSeconds: number = DEFAULT_LOCK_TTL_SECONDS,
): Promise<string | null> {
  const lockKey = `${LOCK_PREFIX}:${resourceId}`
  const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}` // Unique ID cho mỗi lần lock

  // SETNX: Chỉ set nếu key chưa tồn tại. EX: Tự expire sau ttlSeconds.
  const result = await redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX')

  if (result === 'OK') {
    logger.log(`[LOCK] Acquired lock for resource: ${resourceId} (TTL: ${ttlSeconds}s)`)
    return lockValue
  }

  logger.warn(`[LOCK] Resource ${resourceId} đang bị lock bởi worker khác. Bỏ qua.`)
  return null
}

/**
 * Giải phóng Distributed Lock.
 * Chỉ xóa nếu lockValue khớp (tránh worker A xóa nhầm lock của worker B).
 * Sử dụng Lua Script để đảm bảo atomic (check + delete trong 1 lệnh Redis duy nhất).
 */
export async function releaseLock(redis: Redis, resourceId: string, lockValue: string): Promise<void> {
  const lockKey = `${LOCK_PREFIX}:${resourceId}`

  // Lua Script: Kiểm tra value khớp rồi mới xóa (Atomic operation)
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `

  const result = await redis.eval(luaScript, 1, lockKey, lockValue)

  if (result === 1) {
    logger.log(`[LOCK] Released lock for resource: ${resourceId}`)
  } else {
    logger.warn(`[LOCK] Lock for ${resourceId} đã hết hạn hoặc bị giải phóng bởi process khác.`)
  }
}
