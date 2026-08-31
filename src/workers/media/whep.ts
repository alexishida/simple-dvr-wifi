import { randomBytes } from 'node:crypto'
import type { CodecName } from './codec-strategy.js'

export interface WhepSession {
  sessionId: string
  url: string
  token: string
}

export interface WhepClientOptions {
  httpPort: number
  path: string
  token: string
  fetchImpl?: (url: string, init: RequestInit) => Promise<{ status: number; body: string }>
}

export interface WhepHandshakeResult {
  status: 'ok' | 'not_found' | 'unauthorized' | 'error'
  body: string
}

export interface CodecProbeResult {
  codec: CodecName
  whepSupported: boolean
}

export function createWhepSession(options: {
  httpPort: number
  path: string
  token: string
}): WhepSession {
  return {
    sessionId: randomBytes(12).toString('hex'),
    url: `http://127.0.0.1:${options.httpPort}/${options.path}/whep`,
    token: options.token,
  }
}

export async function whepHandshake(
  session: WhepSession,
  options: { sdpOffer: string; fetchImpl?: WhepClientOptions['fetchImpl'] },
): Promise<WhepHandshakeResult> {
  const fetchImpl =
    options.fetchImpl ??
    (async (url, init) => {
      const response = await fetch(url, init)
      return { status: response.status, body: await response.text() }
    })

  const init: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/sdp',
      Accept: 'application/sdp',
    },
    body: options.sdpOffer,
  }

  try {
    const response = await fetchImpl(session.url, init)
    if (response.status === 200 || response.status === 201) {
      return { status: 'ok', body: response.body }
    }
    if (response.status === 401 || response.status === 403) {
      return { status: 'unauthorized', body: response.body }
    }
    if (response.status === 404) {
      return { status: 'not_found', body: response.body }
    }
    return { status: 'error', body: response.body }
  } catch {
    return { status: 'error', body: '' }
  }
}

export function whepUrlForPort(httpPort: number, path: string): string {
  return `http://127.0.0.1:${httpPort}/${path}/whep`
}

export function isLoopbackOnly(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '[::1]'
    )
  } catch {
    return false
  }
}

export function codecFromSdpOffer(sdp: string): CodecName {
  if (/H265|HEVC/.test(sdp)) return 'H265'
  if (/JPEG/.test(sdp)) return 'MJPEG'
  if (/H264|AVC/.test(sdp)) return 'H264'
  return 'unknown'
}

export function probeCodecInSdp(sdp: string): CodecProbeResult {
  return {
    codec: codecFromSdpOffer(sdp),
    whepSupported: /a=rtpmap/.test(sdp),
  }
}
