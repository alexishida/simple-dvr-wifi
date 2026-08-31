export type ProbeResult = 'ok' | 'unreachable' | 'timeout' | 'auth_error' | 'unsupported'

export interface HttpProbeOptions {
  url: string
  username?: string | null
  password?: string | null
  timeoutMs?: number
  signal?: AbortSignal
  fetchImpl?: (url: string, init: RequestInit) => Promise<{ status: number }>
}

export interface RtspProbeOptions {
  url: string
  username?: string | null
  password?: string | null
  timeoutMs?: number
  signal?: AbortSignal
  checkImpl?: (options: RtspCheckOptions) => Promise<ProbeResult>
}

export interface RtspCheckOptions {
  url: string
  username?: string | null
  password?: string | null
  timeoutMs: number
  signal?: AbortSignal
}

function parseUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL de probe deve ser HTTP(S).')
  }
  return url
}

function buildAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

export async function probeHttp(options: HttpProbeOptions): Promise<ProbeResult> {
  const url = parseUrl(options.url)
  const timeoutMs = options.timeoutMs ?? 5_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal
  const headers: Record<string, string> = { Accept: '*/*' }
  if (options.username) {
    headers.Authorization = buildAuthorization(options.username, options.password ?? '')
  }

  try {
    const fetchImpl = options.fetchImpl ?? ((u, init) => fetch(u, init))
    const response = await fetchImpl(url.toString(), { method: 'GET', headers, signal })
    if (controller.signal.aborted) return 'timeout'
    if (response.status === 401 || response.status === 403) {
      return options.username ? 'auth_error' : 'unsupported'
    }
    return response.status < 500 ? 'ok' : 'unreachable'
  } catch (error) {
    if (options.signal?.aborted || controller.signal.aborted) return 'timeout'
    if (error instanceof Error && error.name === 'AbortError') return 'timeout'
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}

export async function probeRtsp(options: RtspProbeOptions): Promise<ProbeResult> {
  const url = new URL(options.url)
  if (url.protocol !== 'rtsp:' && url.protocol !== 'rtsps:') {
    return 'unsupported'
  }
  const timeoutMs = options.timeoutMs ?? 5_000
  const checkImpl =
    options.checkImpl ??
    (async (checkOptions: RtspCheckOptions): Promise<ProbeResult> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), checkOptions.timeoutMs)
      try {
        const { createConnection } = await import('node:net')
        const connection = await new Promise<'ok' | 'auth_error' | 'timeout'>((resolve) => {
          const socket = createConnection({
            host: checkOptions.url.hostname,
            port: Number(checkOptions.url.port || 554),
          })
          socket.setTimeout(checkOptions.timeoutMs)
          socket.once('connect', () => {
            socket.write(
              `DESCRIBE ${checkOptions.url.pathname} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: SimpleDvrWifi\r\nAccept: application/sdp\r\n\r\n`,
            )
          })
          socket.once('data', (data: Buffer) => {
            const text = data.toString('utf8')
            socket.destroy()
            if (text.startsWith('RTSP/1.0 401')) resolve('auth_error')
            else if (/^RTSP\/1\.0 2\d\d/.test(text)) resolve('ok')
            else resolve('timeout')
          })
          socket.once('timeout', () => {
            socket.destroy()
            resolve('timeout')
          })
          socket.once('error', () => {
            socket.destroy()
            resolve('unreachable')
          })
          socket.once('close', () => {
            resolve('unreachable')
          })
        })
        clearTimeout(timer)
        return connection
      } catch {
        return 'unreachable'
      }
    })

  return checkImpl({
    url,
    username: options.username,
    password: options.password,
    timeoutMs,
    signal: options.signal,
  })
}
