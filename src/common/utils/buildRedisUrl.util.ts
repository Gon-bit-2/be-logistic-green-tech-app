import envConfig from 'src/config/config'

/**
 * Build Redis URL from environment variables
 * @returns string
 */
function buildRedisUrl(): string {
  if (envConfig.REDIS_URL) {
    return envConfig.REDIS_URL
  }

  const auth =
    envConfig.REDIS_USERNAME || envConfig.REDIS_PASSWORD
      ? `${encodeURIComponent(envConfig.REDIS_USERNAME)}:${encodeURIComponent(envConfig.REDIS_PASSWORD)}@`
      : ''

  return `redis://${auth}${envConfig.REDIS_HOST}:${envConfig.REDIS_PORT}`
}
export { buildRedisUrl }
