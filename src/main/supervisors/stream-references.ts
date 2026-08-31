export type StreamProfile = 'main' | 'sub'

export interface StreamKey {
  cameraId: string
  profile: StreamProfile
}

export interface ReferenceLease {
  key: StreamKey
  consumers: number
  release(): void
}

export class StreamReferenceManager {
  private readonly counters = new Map<string, number>()
  private readonly emptyCallbacks = new Map<string, Array<() => void>>()

  private keyOf(key: StreamKey): string {
    return `${key.cameraId}:${key.profile}`
  }

  acquire(key: StreamKey): ReferenceLease {
    const id = this.keyOf(key)
    const current = this.counters.get(id) ?? 0
    this.counters.set(id, current + 1)
    let released = false

    return {
      key,
      consumers: current + 1,
      release: () => {
        if (released) return
        released = true
        const next = (this.counters.get(id) ?? 1) - 1
        if (next <= 0) {
          this.counters.delete(id)
          for (const callback of this.emptyCallbacks.get(id) ?? []) callback()
          this.emptyCallbacks.delete(id)
        } else {
          this.counters.set(id, next)
        }
      },
    }
  }

  consumers(key: StreamKey): number {
    return this.counters.get(this.keyOf(key)) ?? 0
  }

  onEmpty(key: StreamKey, callback: () => void): void {
    const id = this.keyOf(key)
    const list = this.emptyCallbacks.get(id) ?? []
    list.push(callback)
    this.emptyCallbacks.set(id, list)
  }

  snapshot(): Array<{ key: StreamKey; consumers: number }> {
    const result: Array<{ key: StreamKey; consumers: number }> = []
    for (const [id, consumers] of this.counters) {
      const [cameraId, profile] = id.split(':')
      result.push({ key: { cameraId: cameraId!, profile: profile as StreamProfile }, consumers })
    }
    return result
  }
}
