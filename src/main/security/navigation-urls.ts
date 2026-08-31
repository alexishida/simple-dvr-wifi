export const PACKAGED_RENDERER_ORIGIN = 'app://renderer'

export function originOfUrl(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.protocol === 'app:') {
    if (!url.host) return null
    return `app://${url.host}`
  }

  return url.origin
}

export function isAllowedNavigationUrl(rawUrl: string, allowedOrigins: readonly string[]): boolean {
  const origin = originOfUrl(rawUrl)
  return origin !== null && allowedOrigins.includes(origin)
}

export function devServerOrigin(rendererUrl: string | undefined): string | null {
  if (!rendererUrl) return null
  try {
    return new URL(rendererUrl).origin
  } catch {
    return null
  }
}
