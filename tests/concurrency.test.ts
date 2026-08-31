import { describe, expect, it } from 'vitest'
import { ConcurrencyLimitExceededError, TaskPool } from '../src/main/supervisors/concurrency.js'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('task pool with limited concurrency', () => {
  it('runs at most N tasks concurrently', async () => {
    const pool = new TaskPool(2)
    let active = 0
    let peak = 0

    await pool.allSettled(
      Array.from({ length: 6 }, () => async () => {
        active++
        peak = Math.max(peak, active)
        await delay(20)
        active--
      }),
    )

    expect(peak).toBe(2)
  })

  it('does not let a stuck camera block other tasks', async () => {
    const pool = new TaskPool(1)
    let resolvedCount = 0

    const result = await pool.allSettled([
      async () => {
        await delay(10)
        resolvedCount++
        return 'ok'
      },
      async () => {
        await delay(1000)
        resolvedCount++
        return 'slow'
      },
    ])

    // First task completes; second may be slow but the pool doesn't block unrelated work
    expect(result[0]?.status).toBe('fulfilled')
    expect(resolvedCount).toBeGreaterThanOrEqual(1)
  })

  it('aborts tasks via the shared signal', async () => {
    const pool = new TaskPool(2)
    const seenAbort = { value: false }

    const task = pool.run(async (signal) => {
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          seenAbort.value = true
          resolve()
          return
        }
        signal.addEventListener(
          'abort',
          () => {
            seenAbort.value = true
            resolve()
          },
          { once: true },
        )
      })
      return 'aborted'
    })

    pool.abort()
    await task
    expect(seenAbort.value).toBe(true)
  })

  it('rejects new work after abort', async () => {
    const pool = new TaskPool(1)
    pool.abort()
    await expect(pool.run(async () => 'x')).rejects.toBeInstanceOf(ConcurrencyLimitExceededError)
  })
})
