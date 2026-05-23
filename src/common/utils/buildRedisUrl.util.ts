import envConfig from 'src/config/config'

/**
 * Builds a standardized Redis connection URL from configuration parameters.
 * Xây dựng URL kết nối Redis tiêu chuẩn hóa từ các tham số cấu hình.
 *
 * If `REDIS_URL` env variable is already present, it is returned directly. Otherwise,
 * it formats username, password, host, and port appropriately.
 * Nếu biến môi trường `REDIS_URL` đã có sẵn, nó sẽ trả về trực tiếp. Ngược lại,
 * nó định dạng tài khoản, mật khẩu, host và port một cách phù hợp.
 *
 * @returns {string} The formatted Redis connection URL.
 * @returns {string} URL kết nối Redis đã định dạng.
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
