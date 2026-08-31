const PASSWORD_PATTERN = /(password|passwd|pwd|senha)["']?\s*[:=]\s*["'][^"']*["']/gi
const TOKEN_PATTERN =
  /(token|access_token|refresh_token|apikey|api_key)["']?\s*[:=]\s*["'][^"']*["']/gi
const AUTHORIZATION_HEADER = /(authorization|proxy-authorization)["']?\s*[:=]\s*["'][^"']*["']/gi
const BEARER_TOKEN = /(bearer)\s+[A-Za-z0-9._~+/=-]+/gi
const BASIC_CREDENTIALS = /(basic)\s+[A-Za-z0-9+/=]+/gi
const KEY_PATTERN = /(private[_-]?key|secret|passphrase)["']?\s*[:=]\s*["'][^"']*["']/gi
const UNQUOTED_SECRET =
  /\b(?:password|passwd|pwd|secret|private_key|token|api_key|apikey)\s*[:=]\s*\S+/gi

const REDACTED = '[REDACTED]'

export function sanitizeLine(input: string): string {
  let output = input
  output = output.replace(PASSWORD_PATTERN, (match) =>
    match.replace(/(["'][^"']*["'])$/i, `"${REDACTED}"`),
  )
  output = output.replace(TOKEN_PATTERN, (match) =>
    match.replace(/(["'][^"']*["'])$/i, `"${REDACTED}"`),
  )
  output = output.replace(AUTHORIZATION_HEADER, (match) =>
    match.replace(/(["'][^"']*["'])$/i, `"${REDACTED}"`),
  )
  output = output.replace(BEARER_TOKEN, `Bearer ${REDACTED}`)
  output = output.replace(BASIC_CREDENTIALS, `Basic ${REDACTED}`)
  output = output.replace(KEY_PATTERN, (match) =>
    match.replace(/(["'][^"']*["'])$/i, `"${REDACTED}"`),
  )
  output = output.replace(UNQUOTED_SECRET, (match) =>
    match.replace(/([:=]\s*)\S+$/i, `$1${REDACTED}`),
  )
  return output
}

export function sanitizeUrlCredentials(input: string): string {
  return input.replace(
    /([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/gi,
    (_match, scheme: string) => `${scheme}${REDACTED}@`,
  )
}

export function sanitizeSidecarOutput(input: string): string {
  return sanitizeUrlCredentials(sanitizeLine(input))
}

export function sanitizeValue(value: string): string {
  return value.replace(/./g, '*').slice(0, 32)
}
