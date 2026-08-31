import { describe, expect, it } from 'vitest'
import { RecordingCloseGuard } from '../src/main/services/close-guard.js'

function fakeClock() {
  const timers = new Map<number, () => void>()
  let nextId = 1
  return {
    clock: {
      setTimeout: (callback: () => void, delayMs: number) => {
        void delayMs
        const id = nextId++
        timers.set(id, callback)
        return id
      },
      clearTimeout: (handle: unknown) => {
        timers.delete(handle as number)
      },
    },
    pending: () => timers.size,
    fire: () => {
      const callbacks = [...timers.values()]
      timers.clear()
      for (const callback of callbacks) callback()
    },
  }
}

describe('recording close guard', () => {
  it('allows close when there are no active recordings', async () => {
    const guard = new RecordingCloseGuard({
      hasActiveRecordings: () => false,
      flush: async () => 0,
    })
    expect(await guard.handleClose()).toEqual({ allowClose: true, reason: 'no_active' })
  })

  it('flushes and allows close when recordings finish in time', async () => {
    const guard = new RecordingCloseGuard({
      hasActiveRecordings: () => true,
      flush: async () => 2,
      flushTimeoutMs: 1000,
    })
    const decision = await guard.handleClose()
    expect(decision).toEqual({ allowClose: true, reason: 'flushed' })
  })

  it('blocks close when flush times out', async () => {
    const fake = fakeClock()
    const guard = new RecordingCloseGuard({
      hasActiveRecordings: () => true,
      flush: () => new Promise(() => undefined),
      flushTimeoutMs: 500,
      clock: fake.clock,
    })
    const pending = guard.handleClose()
    fake.fire()
    const decision = await pending
    expect(decision).toEqual({ allowClose: false, reason: 'timeout' })
  })

  it('forces close after flush timeout with a confirmed decision', async () => {
    const fake = fakeClock()
    const guard = new RecordingCloseGuard({
      hasActiveRecordings: () => true,
      flush: () => new Promise(() => undefined),
      flushTimeoutMs: 500,
      clock: fake.clock,
    })
    const pending = guard.handleClose(true)
    fake.fire()
    const decision = await pending
    expect(decision).toEqual({ allowClose: true, reason: 'forced' })
  })

  it('does not leave orphan timers after a successful flush', async () => {
    const fake = fakeClock()
    const guard = new RecordingCloseGuard({
      hasActiveRecordings: () => true,
      flush: async () => 1,
      flushTimeoutMs: 1000,
      clock: fake.clock,
    })
    await guard.handleClose()
    expect(fake.pending()).toBe(0)
  })
})
