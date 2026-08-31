export interface CloseGuardOptions {
  flushTimeoutMs?: number
  hasActiveRecordings: () => boolean
  flush: () => Promise<number>
  clock?: {
    setTimeout(callback: () => void, delayMs: number): unknown
    clearTimeout(handle: unknown): void
  }
}

export interface CloseDecision {
  allowClose: boolean
  reason: 'no_active' | 'flushed' | 'timeout' | 'forced'
}

const SYSTEM_CLOCK = {
  setTimeout: (callback: () => void, delayMs: number): NodeJS.Timeout =>
    setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown): void => clearTimeout(handle as NodeJS.Timeout),
}

export class RecordingCloseGuard {
  private readonly flushTimeoutMs: number
  private readonly clock: NonNullable<CloseGuardOptions['clock']>

  constructor(private readonly options: CloseGuardOptions) {
    this.flushTimeoutMs = options.flushTimeoutMs ?? 3_000
    this.clock = options.clock ?? SYSTEM_CLOCK
  }

  async handleClose(force = false): Promise<CloseDecision> {
    if (!this.options.hasActiveRecordings()) {
      return { allowClose: true, reason: 'no_active' }
    }

    if (force) {
      // best-effort flush with a short timeout, allow close regardless
      await this.flushWithTimeout()
      return { allowClose: true, reason: 'forced' }
    }

    const flushed = await this.flushWithTimeout()
    if (flushed) {
      return { allowClose: true, reason: 'flushed' }
    }
    return { allowClose: false, reason: 'timeout' }
  }

  private flushWithTimeout(): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false
      const timer = this.clock.setTimeout(() => {
        if (!settled) {
          settled = true
          resolve(false)
        }
      }, this.flushTimeoutMs)

      this.options
        .flush()
        .then(() => {
          if (!settled) {
            settled = true
            this.clock.clearTimeout(timer)
            resolve(true)
          }
        })
        .catch(() => {
          if (!settled) {
            settled = true
            this.clock.clearTimeout(timer)
            resolve(false)
          }
        })
    })
  }
}
