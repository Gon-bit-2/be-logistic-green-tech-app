import { buildGoogleRedirectUrl } from './google-redirect.util'

describe('buildGoogleRedirectUrl', () => {
  it('builds a deep link redirect with auth tokens', () => {
    const redirectUrl = buildGoogleRedirectUrl('appecomerce://callback', {
      accessToken: 'access.token.value',
      refreshToken: 'refresh.token.value',
    })

    expect(redirectUrl).toBe(
      'appecomerce://callback?accessToken=access.token.value&refreshToken=refresh.token.value',
    )
  })

  it('preserves existing query and hash while encoding error messages', () => {
    const redirectUrl = buildGoogleRedirectUrl('https://example.com/auth/callback?from=google#/done', {
      errorMessage: 'Có lỗi khi đăng nhập bằng google vui lòng thử lại cách khác',
    })

    const parsedUrl = new URL(redirectUrl)

    expect(parsedUrl.searchParams.get('from')).toBe('google')
    expect(parsedUrl.searchParams.get('errorMessage')).toBe(
      'Có lỗi khi đăng nhập bằng google vui lòng thử lại cách khác',
    )
    expect(parsedUrl.hash).toBe('#/done')
  })
})
