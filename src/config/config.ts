/**
 * Configuration module that parses and validates environment variables.
 * Module cấu hình phân tích và kiểm chứng các biến môi trường.
 *
 * Uses Zod schema validation to ensure all required configuration keys are present
 * and correctly formatted before the application starts. If validation fails,
 * it logs the missing/invalid keys and terminates the process with code 1.
 */
import z from 'zod'
import 'dotenv/config'
import { Logger } from '@nestjs/common'

const logger = new Logger('Config')
const ConfigSchema = z.object({
  DATABASE_URL: z.string(),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  ACCESS_TOKEN_SECRET: z.string(),
  ACCESS_TOKEN_EXPIRES_IN: z.string(),
  REFRESH_TOKEN_SECRET: z.string(),
  REFRESH_TOKEN_EXPIRES_IN: z.string(),
  API_KEY_SECRET: z.string(),
  PAYMENT_API_KEY: z.string(),
  ADMIN_NAME: z.string(),
  ADMIN_PASSWORD: z.string(),
  ADMIN_EMAIL: z.string(),
  ADMIN_PHONE_NUMBER: z.string(),
  OTP_EXPIRES_IN: z.string(),
  RESEND_API_KEY: z.string(),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string(),
  GOOGLE_CLIENT_REDIRECT_URI: z.string(),
  REDIS_USERNAME: z.string(),
  REDIS_PASSWORD: z.string(),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number(),
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),
  GOONG_MAPS_API_KEY: z.string(),
  GOONG_BASE_URL: z.string(),
  OSRM_BASE_URL: z.string().default('http://router.project-osrm.org'),
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().optional(),
  REDIS_URL: z.string().optional(),
  PRISMA_QUERY_LOG: z
    .enum(['0', '1'])
    .default('0')
    .transform((value) => value === '1'),
  SLOW_REQUEST_MS: z.coerce.number().nonnegative().default(1_000),
  TRACKING_ACCESS_CACHE_TTL_MS: z.coerce.number().nonnegative().default(15_000),
})

const configServer = ConfigSchema.safeParse(process.env)
if (!configServer.success) {
  logger.error('Các giá trị env không hợp lệ')
  logger.error(configServer.error.message)
  process.exit(1)
}
const envConfig = configServer.data
export default envConfig
