jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}))

jest.mock('helmet', () => jest.fn(() => 'helmet-middleware'))
jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
    setDescription: jest.fn().mockReturnThis(),
    setTitle: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
  })),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
}))
jest.mock('nestjs-zod', () => {
  const actual = jest.requireActual('nestjs-zod')
  return {
    ...actual,
    ZodSerializerInterceptor: jest.fn(),
    ZodValidationPipe: jest.fn(),
    cleanupOpenApiDoc: jest.fn((document) => document),
  }
})

import helmet from 'helmet'
import { NestFactory } from '@nestjs/core'
import { bootstrap } from './main'
import { AppModule } from './app.module'
import envConfig from './config/config'

describe('bootstrap', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('creates the app with rawBody enabled', async () => {
    const app = {
      use: jest.fn(),
      enableCors: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      get: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    }

    ;(NestFactory.create as jest.Mock).mockResolvedValue(app)

    await bootstrap()

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule, { rawBody: true })
    expect(app.use).toHaveBeenCalledWith('helmet-middleware')
    expect(app.enableCors).toHaveBeenCalledTimes(1)
    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1)
    expect(app.useGlobalInterceptors).toHaveBeenCalledTimes(1)
    expect(app.get).toHaveBeenCalledTimes(1)
    expect(app.listen).toHaveBeenCalledWith(envConfig.PORT)
    expect(helmet).toHaveBeenCalledTimes(1)
  })
})
