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
      redeemGoogleSession: jest.fn(),
    }
    response = {
      redirect: jest.fn(),
    }

    controller = new AuthController(authService, googleService)
  })

  it('redirects to client callback with a one-time session token after successful Google login', async () => {
    googleService.googleCallback.mockResolvedValue({
      sessionToken: '7d4a08ca-283e-4bf7-bb93-9b19b593c396',
    })

    await controller.googleCallback('state', 'google-code', undefined, response)

    expect(response.redirect).toHaveBeenCalledWith(
      'appecomerce://callback?sessionToken=7d4a08ca-283e-4bf7-bb93-9b19b593c396',
    )
  })

  it('redeems Google session token via service', async () => {
    googleService.redeemGoogleSession.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })

    const result = await controller.exchangeGoogleSession({
      sessionToken: '7d4a08ca-283e-4bf7-bb93-9b19b593c396',
    } as any)

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    expect(googleService.redeemGoogleSession).toHaveBeenCalledWith('7d4a08ca-283e-4bf7-bb93-9b19b593c396')
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

  it('does not redirect internal Google login errors back to the client URL', async () => {
    googleService.googleCallback.mockRejectedValue(
      new Error(
        '\nInvalid `Object.create()` invocation in D:\\Works\\logistic-green-tech\\backend\\dist\\main.js:928:2450',
      ),
    )

    await controller.googleCallback('state', 'google-code', undefined, response)

    expect(response.redirect).toHaveBeenCalledWith(
      'appecomerce://callback?errorMessage=C%C3%B3+l%E1%BB%97i+khi+%C4%91%C4%83ng+nh%E1%BA%ADp+b%E1%BA%B1ng+google+vui+l%C3%B2ng+th%E1%BB%AD+l%E1%BA%A1i+c%C3%A1ch+kh%C3%A1c',
    )
  })
})
