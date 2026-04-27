export const buildGoogleRedirectUrl = (baseUrl: string, params: Record<string, string | null | undefined>) => {
  const redirectUrl = new URL(baseUrl)

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      redirectUrl.searchParams.set(key, value)
    }
  }

  return redirectUrl.toString()
}
