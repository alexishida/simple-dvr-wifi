import { describe, expect, it } from 'vitest'
import { PtzControlService } from '../src/main/services/ptz-control.js'
import {
  PtzCommandGuard,
  ptzCapabilitiesFromOnvif,
  type PtzServiceInterface,
} from '../src/workers/camera/ptz-adapter.js'
import type { PtzVelocity } from '../src/workers/camera/ptz-velocity.js'

interface FakeEntry {
  id: number
  delay: number
  callback: () => void
}

function fakeClock() {
  const queue: FakeEntry[] = []
  let nextId = 1
  return {
    clock: {
      setTimeout: (callback: () => void, delayMs: number) => {
        const id = nextId++
        queue.push({ id, delay: delayMs, callback })
        return id
      },
      clearTimeout: (handle: unknown) => {
        const index = queue.findIndex((q) => q.id === handle)
        if (index !== -1) queue.splice(index, 1)
      },
    },
    fire: (ms: number) => {
      const ready = queue
        .filter((q) => q.delay <= ms)
        .sort((a, b) => a.delay - b.delay || a.id - b.id)
      for (const entry of ready) {
        const index = queue.indexOf(entry)
        queue.splice(index, 1)
        entry.callback()
      }
    },
    pending: () => queue.length,
  }
}

function adapter(failStop = false): {
  service: PtzServiceInterface
  calls: { stops: number; moves: number }
} {
  const calls = { stops: 0, moves: 0 }
  const service: PtzServiceInterface = {
    continuousMove: async () => {
      calls.moves++
    },
    stop: async () => {
      calls.stops++
      if (failStop) throw new Error('stop failed')
    },
    relativeMove: async () => undefined,
    absoluteMove: async () => undefined,
    listPresets: async () => [],
    gotoPreset: async () => undefined,
    setPreset: async () => 'p',
    removePreset: async () => undefined,
  }
  return { service, calls }
}

const VELOCITY: PtzVelocity = { pan: 0.5, tilt: 0 }

describe('PTZ control service', () => {
  it('starts continuous move and stops on pointer release', async () => {
    const { service, calls } = adapter()
    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), service)
    const control = new PtzControlService(guard, 'main', { leaseMs: 5000 })

    await control.startMove('cam-1', VELOCITY)
    expect(control.isMoving).toBe(true)
    expect(calls.moves).toBe(1)

    await control.stop('pointer_release')
    expect(control.isMoving).toBe(false)
    expect(calls.stops).toBe(1)
    expect(control.state.lastTrigger).toBe('pointer_release')
  })

  it('sends a safety stop when the lease expires', async () => {
    const fake = fakeClock()
    const { service, calls } = adapter()
    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), service)
    const control = new PtzControlService(guard, 'main', { leaseMs: 1000, clock: fake.clock })

    await control.startMove('cam-1', VELOCITY)
    expect(control.isMoving).toBe(true)

    fake.fire(1000)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(control.isMoving).toBe(false)
    expect(calls.stops).toBe(1)
    expect(control.state.lastTrigger).toBe('lease_expiry')
  })

  it('stops on camera switch, blur, unmount and shutdown', async () => {
    const fake = fakeClock()
    const { service, calls } = adapter()
    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), service)
    const control = new PtzControlService(guard, 'main', { leaseMs: 5000, clock: fake.clock })

    await control.startMove('cam-1', VELOCITY)
    await control.cameraChanged('cam-2')
    expect(control.isMoving).toBe(false)
    expect(calls.stops).toBe(1)
    expect(control.state.lastTrigger).toBe('camera_switch')

    await control.startMove('cam-2', VELOCITY)
    await control.stop('blur')
    expect(control.state.lastTrigger).toBe('blur')

    await control.startMove('cam-2', VELOCITY)
    await control.stop('unmount')
    expect(control.state.lastTrigger).toBe('unmount')

    await control.startMove('cam-2', VELOCITY)
    await control.shutdown()
    expect(control.state.lastTrigger).toBe('shutdown')
    expect(fake.pending()).toBe(0)
  })

  it('blocks new moves after repeated Stop failures', async () => {
    const { service, calls } = adapter(true)
    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), service)
    const control = new PtzControlService(guard, 'main', {
      leaseMs: 5000,
      stopRetryLimit: 3,
    })

    await control.startMove('cam-1', VELOCITY)
    await control.stop('failure')
    expect(control.isStopBlocked).toBe(false)
    expect(control.state.stopFailures).toBe(1)
    expect(calls.stops).toBe(1)

    await control.startMove('cam-1', VELOCITY)
    await control.stop('failure')
    await control.startMove('cam-1', VELOCITY)
    await control.stop('failure')
    await control.startMove('cam-1', VELOCITY)
    await control.stop('failure')
    expect(control.isStopBlocked).toBe(true)
    expect(control.state.stopFailures).toBeGreaterThanOrEqual(3)
  })

  it('rejects invalid velocities without sending a command', async () => {
    const { service, calls } = adapter()
    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), service)
    const control = new PtzControlService(guard, 'main')

    await expect(control.startMove('cam-1', { pan: Number.NaN })).rejects.toThrow()
    expect(calls.moves).toBe(0)
  })

  it('renews the lease while the control stays active', async () => {
    const fake = fakeClock()
    const { service, calls } = adapter()
    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), service)
    const control = new PtzControlService(guard, 'main', { leaseMs: 1000, clock: fake.clock })

    await control.startMove('cam-1', VELOCITY)
    await control.renew('cam-1', VELOCITY)
    expect(control.isMoving).toBe(true)
    expect(fake.pending()).toBe(1)
    expect(calls.moves).toBe(1)

    await control.stop('key_release')
    expect(control.isMoving).toBe(false)
    expect(calls.stops).toBe(1)
  })
})
