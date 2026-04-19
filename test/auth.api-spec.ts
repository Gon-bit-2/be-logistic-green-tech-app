import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AuthController } from '../src/modules/auth/controller/auth.controller'
import { AuthService } from '../src/modules/auth/service/auth.service'
import { GoogleService } from '../src/modules/auth/service/google.service'
import { createHttpTestApp } from './helpers/create-http-test-app'

describe('Auth API', () => {
  let app: INestApplication
  const authService = {
    sendOTP: jest.fn(),
    login: jest.fn(),
  }
  const googleService = {
    getAuthorizationUrl: jest.fn(),
    googleCallback: jest.fn(),
  }

  beforeAll(async () => {
    const testApp = await createHttpTestApp({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: GoogleService, useValue: googleService },
      ],
    })

    app = testApp.app
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  it('POST /auth/otp forwards a valid body to AuthService', async () => {
    authService.sendOTP.mockResolvedValue({ message: 'otp-sent' })

    await request(app.getHttpServer())
      .post('/auth/otp')
      .send({ email: 'user@example.com', type: 'REGISTER' })
      .expect(201)
      .expect({ message: 'otp-sent' })

    expect(authService.sendOTP).toHaveBeenCalledWith({
      email: 'user@example.com',
      type: 'REGISTER',
    })
  })

  it('POST /auth/login forwards body, user-agent, and ip to AuthService', async () => {
    authService.login.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' })

    await request(app.getHttpServer())
      .post('/auth/login')
      .set('User-Agent', 'jest-agent')
      .send({ email: 'user@example.com', password: 'Secret123' })
      .expect(201)
      .expect({ accessToken: 'at', refreshToken: 'rt' })

    expect(authService.login).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        password: 'Secret123',
        userAgent: 'jest-agent',
      }),
    )
    expect(typeof authService.login.mock.calls[0][0].ip).toBe('string')
  })
})
