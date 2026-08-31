import { describe, expect, it } from 'vitest'
import { decideCodecStrategy, defaultCodecProbe } from '../src/workers/media/codec-strategy.js'

describe('codec strategy', () => {
  it('plays H264 directly without transcode', () => {
    const decision = decideCodecStrategy('H264', defaultCodecProbe())
    expect(decision.strategy).toBe('direct')
    expect(decision.fallbackCodec).toBeNull()
  })

  it('transcodes H265 when the player lacks support but fallback exists', () => {
    const decision = decideCodecStrategy('H265', {
      playerSupports: (codec) => codec === 'H264',
      h265Available: true,
      mjpegAvailable: false,
    })
    expect(decision.strategy).toBe('transcode')
    expect(decision.fallbackCodec).toBe('H264')
  })

  it('reports codec_error when H265 fallback is unavailable', () => {
    const decision = decideCodecStrategy('H265', defaultCodecProbe())
    expect(decision.strategy).toBe('incompatible')
  })

  it('accepts MJPEG when a conversion path exists', () => {
    const decision = decideCodecStrategy('MJPEG', {
      playerSupports: (codec) => codec === 'H264',
      h265Available: false,
      mjpegAvailable: true,
    })
    expect(decision.strategy).toBe('transcode')
    expect(decision.fallbackCodec).toBe('H264')
  })

  it('uses direct playback when the player supports H265', () => {
    const decision = decideCodecStrategy('H265', {
      playerSupports: () => true,
      h265Available: true,
      mjpegAvailable: true,
    })
    expect(decision.strategy).toBe('direct')
  })

  it('declares unknown codecs incompatible', () => {
    const decision = decideCodecStrategy('unknown', defaultCodecProbe())
    expect(decision.strategy).toBe('incompatible')
  })
})
