import { describe, expect, it } from 'vitest'
import {
  StreamReferenceManager,
  type StreamKey,
} from '../src/main/supervisors/stream-references.js'

const MAIN: StreamKey = { cameraId: 'cam-1', profile: 'main' }
const SUB: StreamKey = { cameraId: 'cam-1', profile: 'sub' }

describe('stream reference manager', () => {
  it('shares a path between two consumers and stops after the last release', () => {
    const manager = new StreamReferenceManager()
    let stopped = 0

    const first = manager.acquire(MAIN)
    const second = manager.acquire(MAIN)
    expect(manager.consumers(MAIN)).toBe(2)

    manager.onEmpty(MAIN, () => stopped++)

    first.release()
    expect(manager.consumers(MAIN)).toBe(1)
    expect(stopped).toBe(0)

    second.release()
    expect(manager.consumers(MAIN)).toBe(0)
    expect(stopped).toBe(1)
  })

  it('tracks main and sub paths independently', () => {
    const manager = new StreamReferenceManager()
    const main = manager.acquire(MAIN)
    const sub = manager.acquire(SUB)

    expect(manager.consumers(MAIN)).toBe(1)
    expect(manager.consumers(SUB)).toBe(1)

    main.release()
    expect(manager.consumers(MAIN)).toBe(0)
    expect(manager.consumers(SUB)).toBe(1)

    sub.release()
    expect(manager.consumers(SUB)).toBe(0)
  })

  it('ignores duplicate release of the same lease', () => {
    const manager = new StreamReferenceManager()
    const lease = manager.acquire(MAIN)
    lease.release()
    lease.release()
    expect(manager.consumers(MAIN)).toBe(0)
  })

  it('snapshots current consumers', () => {
    const manager = new StreamReferenceManager()
    manager.acquire(MAIN)
    manager.acquire(MAIN)
    manager.acquire(SUB)
    const snapshot = manager.snapshot()
    expect(snapshot).toEqual([
      { key: MAIN, consumers: 2 },
      { key: SUB, consumers: 1 },
    ])
  })
})
