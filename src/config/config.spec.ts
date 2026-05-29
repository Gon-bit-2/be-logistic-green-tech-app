const REQUIRED_ENV = {
  ACCESS_TOKEN_EXPIRES_IN: '15m',
  ACCESS_TOKEN_SECRET: 'access-secret',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_NAME: 'Admin',
  ADMIN_PASSWORD: 'password',
  ADMIN_PHONE_NUMBER: '0900000000',
  API_KEY_SECRET: 'api-key-secret',
  CLOUDINARY_API_KEY: 'cloudinary-key',
  CLOUDINARY_API_SECRET: 'cloudinary-secret',
  CLOUDINARY_CLOUD_NAME: 'cloudinary',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_REDIRECT_URI: 'http://localhost:3000/auth/google',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3001/auth/google/callback',
  GOONG_BASE_URL: 'https://rsapi.goong.io',
  GOONG_MAPS_API_KEY: 'goong-key',
  OTP_EXPIRES_IN: '5m',
  PAYMENT_API_KEY: 'payment-api-key',
  REDIS_HOST: 'localhost',
  REDIS_PASSWORD: 'redis-password',
  REDIS_PORT: '6379',
  REDIS_USERNAME: 'default',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  REFRESH_TOKEN_SECRET: 'refresh-secret',
  RESEND_API_KEY: 'resend-key',
  STRIPE_SECRET_KEY: 'stripe-secret',
}

describe('env config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    jest.doMock('dotenv/config', () => ({}))
    process.env = { ...REQUIRED_ENV } as NodeJS.ProcessEnv
  })

  afterEach(() => {
    process.env = originalEnv
    jest.dontMock('dotenv/config')
    jest.restoreAllMocks()
  })

  it('loads from process.env without requiring a .env file', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`unexpected process.exit:${code}`)
    }) as never)

    jest.isolateModules(() => {
      const configModule = jest.requireActual<typeof import('./config')>('./config')
      const envConfig = configModule.default

      expect(envConfig.DATABASE_URL).toBe(REQUIRED_ENV.DATABASE_URL)
      expect(envConfig.REDIS_PORT).toBe(6379)
      expect(envConfig.DB_POOL_IDLE_TIMEOUT_MS).toBe(30_000)
      expect(envConfig.DB_POOL_MAX).toBe(10)
      expect(envConfig.OSRM_BASE_URL).toBe('http://router.project-osrm.org')
      expect(envConfig.PRISMA_QUERY_LOG).toBe(false)
      expect(envConfig.SLOW_REQUEST_MS).toBe(1_000)
      expect(envConfig.TRACKING_ACCESS_CACHE_TTL_MS).toBe(15_000)
      expect(envConfig.PORT).toBe(3000)
    })

    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('exits when required process.env values are missing', () => {
    process.env = {} as NodeJS.ProcessEnv
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`)
    }) as never)

    expect(() => {
      jest.isolateModules(() => {
        jest.requireActual<typeof import('./config')>('./config')
      })
    }).toThrow('process.exit:1')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('coerces optional runtime tuning values', () => {
    process.env = {
      ...REQUIRED_ENV,
      DB_POOL_IDLE_TIMEOUT_MS: '45000',
      DB_POOL_MAX: '25',
      OSRM_BASE_URL: 'http://localhost:5000',
      PORT: '4000',
      PRISMA_QUERY_LOG: '1',
      SLOW_REQUEST_MS: '2500',
      TRACKING_ACCESS_CACHE_TTL_MS: '30000',
    } as NodeJS.ProcessEnv

    jest.isolateModules(() => {
      const configModule = jest.requireActual<typeof import('./config')>('./config')
      const envConfig = configModule.default

      expect(envConfig.DB_POOL_IDLE_TIMEOUT_MS).toBe(45_000)
      expect(envConfig.DB_POOL_MAX).toBe(25)
      expect(envConfig.OSRM_BASE_URL).toBe('http://localhost:5000')
      expect(envConfig.PORT).toBe(4000)
      expect(envConfig.PRISMA_QUERY_LOG).toBe(true)
      expect(envConfig.SLOW_REQUEST_MS).toBe(2_500)
      expect(envConfig.TRACKING_ACCESS_CACHE_TTL_MS).toBe(30_000)
    })
  })
})
