import { afterEach, describe, expect, it } from 'vitest'
import { RtspSimulator } from '../src/workers/simulators/rtsp-simulator.js'
import { probeRtsp } from '../src/workers/camera/probes.js'

const active: RtspSimulator[] = []

async function startSimulator(options: ConstructorParameters<typeof RtspSimulator>[0] = {}) {
  const simulator = new RtspSimulator(options)
  await simulator.start()
  active.push(simulator)
  return simulator
}

afterEach(async () => {
  await Promise.all(active.splice(0).map((s) => s.stop()))
})

describe('RTSP stream simulator', () => {
  it('serves an H264 SDP over loopback', async () => {
    const simulator = await startSimulator({ codec: 'H264' })
    const result = await probeRtsp({
      url: simulator.url,
      checkImpl: undefined,
      timeoutMs: 3000,
    })
    expect(result).toBe('ok')
    expect(simulator.sessionCount).toBe(1)
  })

  it('serves MJPEG when configured', async () => {
    const simulator = await startSimulator({ codec: 'MJPEG' })
    const result = await probeRtsp({ url: simulator.url, timeoutMs: 3000 })
    expect(result).toBe('ok')
  })

  it('drops and restores the stream on command', async () => {
    const simulator = await startSimulator()
    expect(await probeRtsp({ url: simulator.url, timeoutMs: 3000 })).toBe('ok')

    simulator.drop()
    expect(simulator.isDown).toBe(true)
    expect(await probeRtsp({ url: simulator.url, timeoutMs: 3000 })).toBe('unreachable')

    simulator.restore()
    expect(await probeRtsp({ url: simulator.url, timeoutMs: 3000 })).toBe('ok')
  })

  it('rejects invalid credentials', async () => {
    const simulator = await startSimulator({
      requireAuth: true,
      username: 'admin',
      password: 'secret',
    })
    expect(await probeRtsp({ url: simulator.url, timeoutMs: 3000 })).toBe('auth_error')
  })
})
