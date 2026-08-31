import { afterEach, describe, expect, it } from 'vitest'
import {
  OnvifSimulator,
  SIMULATED_CAMERA_FIXTURES,
} from '../src/workers/simulators/onvif-simulator.js'
import { OnvifAdapter, type OnvifTransport } from '../src/workers/camera/onvif-adapter.js'

const activeSimulators: OnvifSimulator[] = []

async function startSimulator(): Promise<{ simulator: OnvifSimulator; adapter: OnvifAdapter }> {
  const simulator = new OnvifSimulator({ username: 'admin', password: 'admin' })
  await simulator.start()
  activeSimulators.push(simulator)

  const transport: OnvifTransport = {
    post: async (url, body) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/soap+xml' },
        body,
      })
      return { status: response.status, body: await response.text() }
    },
  }

  const adapter = new OnvifAdapter({
    deviceServiceUrl: simulator.url,
    username: 'admin',
    password: 'admin',
    transport,
  })
  return { simulator, adapter }
}

afterEach(async () => {
  await Promise.all(activeSimulators.splice(0).map((s) => s.stop()))
})

describe('ONVIF simulator fixtures', () => {
  it('detects identity, services and profiles deterministically', async () => {
    const { adapter, simulator } = await startSimulator()
    const info = await adapter.detect()

    expect(info.identity).toEqual({
      manufacturer: 'SimuCam',
      model: 'SIM-100',
      firmwareVersion: '9.9.9',
      serialNumber: 'SIM-SN-001',
    })
    expect(info.profiles).toHaveLength(2)
    expect(info.profiles[0]).toMatchObject({ streamType: 'main', codec: 'H264' })
    expect(info.profiles[1]).toMatchObject({ streamType: 'sub', codec: 'H264' })
    expect(info.ptzSupported).toBe(true)
    expect(simulator.requestLog.length).toBeGreaterThan(0)
  })

  it('rejects requests with wrong credentials', async () => {
    const simulator = new OnvifSimulator({ username: 'admin', password: 'secret' })
    await simulator.start()
    activeSimulators.push(simulator)

    const transport: OnvifTransport = {
      post: async (url, body) => {
        const response = await fetch(url, { method: 'POST', body })
        return { status: response.status, body: await response.text() }
      },
    }
    const adapter = new OnvifAdapter({
      deviceServiceUrl: simulator.url,
      username: 'admin',
      password: 'wrong',
      transport,
    })
    const info = await adapter.detect()
    expect(info.capabilities.onvif).toBe('error')
  })

  it('produces stable fixtures without PTZ', async () => {
    const simulator = SIMULATED_CAMERA_FIXTURES.noPtz()
    await simulator.start()
    activeSimulators.push(simulator)
    const transport: OnvifTransport = {
      post: async (url, body) => {
        const response = await fetch(url, { method: 'POST', body })
        return { status: response.status, body: await response.text() }
      },
    }
    const adapter = new OnvifAdapter({
      deviceServiceUrl: simulator.url,
      username: 'admin',
      password: 'admin',
      transport,
    })
    const info = await adapter.detect()
    expect(info.ptzSupported).toBe(false)
    expect(info.profiles[0]?.codec).toBe('H264')
  })
})
