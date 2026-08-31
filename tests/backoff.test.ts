import { describe, expect, it } from 'vitest'
import {
  computeBackoffDelays,
  ExponentialBackoff,
  type BackoffClock,
} from '../src/main/supervisors/backoff.js'

function fakeClock(): { clock: BackoffClock; fires: (delayMs: number) => void } & {
  timers: Map<number, number>
} {
  const timers = new Map<number, number>()
  let nextId = 1
  const queue: Array<{ id: number; delay: number; callback: () => void }> = []

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
    fires: (delayMs) => {
      const ready = queue.filter((q) => q.delay === delayMs).sort((a, b) => a.id - b.id)
      for (const entry of ready) {
        const index = queue.indexOf(entry)
        queue.splice(index, 1)
        entry.callback()
      }
    },
  }
}

describe('exponential backoff', () => {
  it('computes increasing delays capped by the ceiling', () => {
    const { delays, totalAttempts } = computeBackoffDelays({
      initialDelayMs: 1000,
      maxDelayMs: 8000,
      maxAttempts: 4,
      jitterRatio: 0,
    })
    expect(totalAttempts).toBe(4)
    expect(delays[0]).toBe(1000)
    expect(delays[1]).toBe(2000)
    expect(delays[2]).toBe(4000)
    expect(delays[3]).toBe(8000)
  })

  it('applies jitter within the configured ratio', () => {
    const { delays } = computeBackoffDelays({
      initialDelayMs: 1000,
      maxDelayMs: 8000,
      maxAttempts: 3,
      jitterRatio: 0.5,
    })
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1000)
      expect(delay).toBeLessThanOrEqual(8000)
    }
  })

  it('schedules attempts with the fake clock and resets after stability', () => {
    const fake = fakeClock()
    const backoff = new ExponentialBackoff(
      { initialDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 3, jitterRatio: 0 },
      fake.clock,
    )

    const fired: number[] = []
    expect(backoff.schedule(() => fired.push(1))).toBe(1000)
    fake.fires(1000)
    expect(fired).toEqual([1])
    expect(backoff.currentAttempt).toBe(1)

    backoff.reset()
    expect(backoff.currentAttempt).toBe(0)
    expect(backoff.schedule(() => fired.push(2))).toBe(1000)
    fake.fires(1000)
    expect(fired).toEqual([1, 2])
  })

  it('stops after reaching max attempts', () => {
    const fake = fakeClock()
    const backoff = new ExponentialBackoff(
      { initialDelayMs: 100, maxDelayMs: 400, maxAttempts: 2, jitterRatio: 0 },
      fake.clock,
    )

    let count = 0
    backoff.schedule(() => count++)
    fake.fires(100)
    backoff.schedule(() => count++)
    fake.fires(200)
    expect(count).toBe(2)
    expect(backoff.schedule(() => count++)).toBeNull()
    expect(count).toBe(2)
  })

  it('cancels timers leaving no orphan', () => {
    const fake = fakeClock()
    const backoff = new ExponentialBackoff(
      { initialDelayMs: 100, maxDelayMs: 400, maxAttempts: 3, jitterRatio: 0 },
      fake.clock,
    )

    let fired = 0
    backoff.schedule(() => fired++)
    expect(fake.timers.size).toBe(1)
    backoff.cancel()
    expect(fake.timers.size).toBe(0)
    fake.fires(100)
    expect(fired).toBe(0)
    expect(backoff.isCancelled()).toBe(true)
  })
})
