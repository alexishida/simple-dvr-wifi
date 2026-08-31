import { describe, expect, it } from 'vitest'
import type {
  MediaSessionSupervisor,
  MediaSessionStatus,
} from '../src/main/supervisors/media-session.js'
import { ReconnectingMediaSession } from '../src/main/supervisors/reconnecting-media-session.js'
import type { BackoffClock } from '../src/main/supervisors/backoff.js'

interface FakeEntry {
  id: number
  delay: number
  callback: () => void
}

function fakeClock(): {
  clock: BackoffClock
  timers: Map<number, number>
  advance: (ms: number) => void
} {
  const queue: FakeEntry[] = []
  const timers = new Map<number, number>()
  let nextId = 1
  return {
    timers,
    clock: {
      setTimeout: (callback, delayMs) => {
        const id = nextId++
        queue.push({ id, delay: delayMs, callback })
        timers.set(id, delayMs)
        return id
      },
      clearTimeout: (handle) => {
        const index = queue.findIndex((q) => q.id === handle)
        if (index !== -1) queue.splice(index, 1)
        timers.delete(handle as number)
      },
    },
    advance: (ms) => {
      const ready = queue
        .filter((q) => q.delay <= ms)
        .sort((a, b) => a.delay - b.delay || a.id - b.id)
      for (const entry of ready) {
        const index = queue.indexOf(entry)
        queue.splice(index, 1)
        timers.delete(entry.id)
        entry.callback()
      }
    },
  }
}

function makeSupervisor(results: Array<MediaSessionStatus | 'throw'>): MediaSessionSupervisor {
  const calls: string[] = []
  let index = 0
  const releases: string[] = []
  return {
    acquire: async (_cameraId, rtspUrl) => {
      calls.push(rtspUrl)
      const result = results[Math.min(index++, results.length - 1)]
      if (result === 'throw') throw new Error('RTSP unreachable')
      return result
    },
    release: async (cameraId) => {
      releases.push(cameraId)
    },
  } as unknown as MediaSessionSupervisor
}

function running(): MediaSessionStatus {
  return { state: 'running', restarts: 0, error: null }
}

function crashed(): MediaSessionStatus {
  return { state: 'crashed', restarts: 1, error: 'pipeline inválido' }
}

describe('reconnecting media session', () => {
  it('connects successfully and transitions to connected', async () => {
    const fake = fakeClock()
    const supervisor = makeSupervisor([running()])
    const session = new ReconnectingMediaSession({
      cameraId: 'cam-1',
      rtspUrl: 'rtsp://cam/stream',
      path: 'camera1',
      supervisor,
      backoff: { initialDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 5 },
      clock: fake.clock,
    })

    const status = await session.start()
    expect(status).toBe('connected')
    expect(session.state.status).toBe('connected')
  })

  it('discards an invalid pipeline and retries with backoff', async () => {
    const fake = fakeClock()
    const supervisor = makeSupervisor([crashed(), running()])
    const session = new ReconnectingMediaSession({
      cameraId: 'cam-1',
      rtspUrl: 'rtsp://cam/stream',
      path: 'camera1',
      supervisor,
      backoff: { initialDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 5, jitterRatio: 0 },
      clock: fake.clock,
    })

    const status = await session.start()
    expect(status).toBe('reconnecting')
    expect(session.state.status).toBe('reconnecting')

    // advance through the first backoff delay
    fake.advance(1000)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(session.state.status).toBe('connected')
  })

  it('reconnects after an RTSP drop without reloading', async () => {
    const fake = fakeClock()
    const supervisor = makeSupervisor([running()])
    const session = new ReconnectingMediaSession({
      cameraId: 'cam-1',
      rtspUrl: 'rtsp://cam/stream',
      path: 'camera1',
      supervisor,
      backoff: { initialDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 5, jitterRatio: 0 },
      clock: fake.clock,
    })

    await session.start()
    expect(session.state.status).toBe('connected')

    // Simulate pipeline drop reported by the sidecar
    session.onPipelineFailure('network')
    expect(session.state.status).toBe('reconnecting')

    fake.advance(1000)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(session.state.status).toBe('connected')
  })

  it('stops on disable/remove and cancels timers', async () => {
    const fake = fakeClock()
    const supervisor = makeSupervisor([crashed()])
    const session = new ReconnectingMediaSession({
      cameraId: 'cam-1',
      rtspUrl: 'rtsp://cam/stream',
      path: 'camera1',
      supervisor,
      backoff: { initialDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 5, jitterRatio: 0 },
      clock: fake.clock,
    })

    await session.start()
    expect(session.state.status).toBe('reconnecting')
    expect(fake.timers.size).toBeGreaterThan(0)

    await session.stop()
    expect(session.state.status).toBe('disabled')
    expect(session.state.cancelled).toBe(true)
    expect(fake.timers.size).toBe(0)
  })

  it('resets the backoff after a stable connection window', async () => {
    const fake = fakeClock()
    const supervisor = makeSupervisor([crashed(), running()])
    const session = new ReconnectingMediaSession({
      cameraId: 'cam-1',
      rtspUrl: 'rtsp://cam/stream',
      path: 'camera1',
      supervisor,
      backoff: { initialDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 5, jitterRatio: 0 },
      clock: fake.clock,
      stabilityMs: 500,
    })

    await session.start()
    fake.advance(1000)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(session.state.status).toBe('connected')

    fake.advance(500) // stability window elapses
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(session.state.attempts).toBe(0)
  })
})
