jest.mock('src/config/config', () => ({
  __esModule: true,
  default: {
    GOOGLE_CLIENT_REDIRECT_URI: 'appecomerce://callback',
  },
}))

jest.mock('src/modules/auth/service/auth.service', () => ({
  AuthService: class AuthService {},
}))

jest.mock('src/modules/auth/service/google.service', () => ({
  GoogleService: class GoogleService {},
}))

const { AuthController } = require('./auth.controller')

describe('AuthController', () => {
  let controller: InstanceType<typeof AuthController>
  let authService: any
  let googleService: any
  let response: { redirect: jest.Mock }

  beforeEach(() => {
    authService = {}
    googleService = {
      googleCallback: jest.fn(),
    }
    response = {
      redirect: jest.fn(),
    }

    controller = new AuthController(authService, googleService)
  })

  it('redirects to client callback with tokens after successful Google login', async () => {
    googleService.googleCallback.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })

    await controller.googleCallback('state', 'google-code', undefined, response)

    expect(response.redirect).toHaveBeenCalledWith(
      'appecomerce://callback?accessToken=access-token&refreshToken=refresh-token',
    )
  })

  it('redirects to client callback with a readable message when Google returns no code', async () => {
    await controller.googleCallback('state', undefined, undefined, response)

    expect(googleService.googleCallback).not.toHaveBeenCalled()
    expect(response.redirect).toHaveBeenCalledWith(
      'appecomerce://callback?errorMessage=Thi%E1%BA%BFu+m%C3%A3+x%C3%A1c+th%E1%BB%B1c+t%E1%BB%AB+Google',
    )
  })

  it('redirects to client callback when Google returns an OAuth error', async () => {
    await controller.googleCallback('state', undefined, 'access_denied', response)

    expect(googleService.googleCallback).not.toHaveBeenCalled()
    expect(response.redirect).toHaveBeenCalledWith(
      'appecomerce://callback?errorMessage=Google+OAuth+error%3A+access_denied',
    )
  })
})
