import { describe, expect, it } from 'vitest'
import {
  codecFromSdpOffer,
  createWhepSession,
  isLoopbackOnly,
  probeCodecInSdp,
  whepHandshake,
  whepUrlForPort,
} from '../src/workers/media/whep.js'

describe('WHEP client', () => {
  it('builds a loopback WHEP URL with session token', () => {
    const session = createWhepSession({ httpPort: 16000, path: 'camera1', token: 'abc123' })
    expect(session.url).toBe('http://127.0.0.1:16000/camera1/whep')
    expect(session.token).toBe('abc123')
    expect(isLoopbackOnly(session.url)).toBe(true)
  })

  it('only allows loopback endpoints', () => {
    expect(isLoopbackOnly('http://127.0.0.1:16000/camera1/whep')).toBe(true)
    expect(isLoopbackOnly('http://localhost:16000/camera1/whep')).toBe(true)
    expect(isLoopbackOnly('http://192.168.1.10:16000/camera1/whep')).toBe(false)
    expect(isLoopbackOnly('http://camera.local/whep')).toBe(false)
  })

  it('performs a successful WHEP handshake with bearer token', async () => {
    const session = createWhepSession({ httpPort: 16000, path: 'camera1', token: 'secret-token' })
    let seenAuth = ''
    const result = await whepHandshake(session, {
      sdpOffer: 'v=0\r\na=rtpmap:96 H264/90000',
      fetchImpl: async (_url, init) => {
        seenAuth = String(init.headers?.Authorization ?? '')
        return { status: 200, body: 'v=0\r\na=rtpmap:96 H264/90000' }
      },
    })
    expect(result.status).toBe('ok')
    expect(seenAuth).toBe('Bearer secret-token')
  })

  it('maps 401 to unauthorized', async () => {
    const session = createWhepSession({ httpPort: 16000, path: 'camera1', token: 'bad' })
    const result = await whepHandshake(session, {
      sdpOffer: 'v=0',
      fetchImpl: async () => ({ status: 401, body: 'unauthorized' }),
    })
    expect(result.status).toBe('unauthorized')
  })

  it('probes codec and WHEP support from SDP', () => {
    expect(codecFromSdpOffer('a=rtpmap:96 H264/90000')).toBe('H264')
    expect(codecFromSdpOffer('a=rtpmap:98 H265/90000')).toBe('H265')
    expect(codecFromSdpOffer('a=rtpmap:26 JPEG/90000')).toBe('MJPEG')
    const probe = probeCodecInSdp('a=rtpmap:96 H264/90000')
    expect(probe.codec).toBe('H264')
    expect(probe.whepSupported).toBe(true)
  })

  it('exposes the WHEP URL helper', () => {
    expect(whepUrlForPort(16000, 'camera1')).toBe('http://127.0.0.1:16000/camera1/whep')
  })
})
