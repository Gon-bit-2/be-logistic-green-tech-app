import z from 'zod'
import 'dotenv/config'
import { Logger } from '@nestjs/common'

const logger = new Logger('Config')
const ConfigSchema = z.object({
  DATABASE_URL: z.string(),
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
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().optional(),
  CORS_ORIGINS: z.string().optional(),
  REDIS_URL: z.string().optional(),
})

const configServer = ConfigSchema.safeParse(process.env)
if (!configServer.success) {
  logger.error('Các giá trị env không hợp lệ')
  logger.error(configServer.error.message)
  process.exit(1)
}
const envConfig = configServer.data
export default envConfig
