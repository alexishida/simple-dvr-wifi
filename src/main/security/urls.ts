const ALLOWED_EXTERNAL_SCHEMES = new Set(['http:', 'https:'])

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isSafeExternalUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (!ALLOWED_EXTERNAL_SCHEMES.has(url.protocol)) {
    return false
  }

  if (!url.hostname) {
    return false
  }

  if (url.username || url.password) {
    return false
  }

  if (BLOCKED_HOSTNAMES.has(url.hostname)) {
    return false
  }

  return true
}
