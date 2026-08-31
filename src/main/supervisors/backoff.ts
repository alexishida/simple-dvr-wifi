export interface BackoffOptions {
  initialDelayMs: number
  maxDelayMs: number
  maxAttempts: number
  factor?: number
  jitterRatio?: number
}

export interface BackoffClock {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

const SYSTEM_CLOCK: BackoffClock = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
}

export interface BackoffSchedule {
  delays: number[]
  totalAttempts: number
}

export function computeBackoffDelays(options: BackoffOptions): BackoffSchedule {
  const factor = options.factor ?? 2
  const jitterRatio = options.jitterRatio ?? 0.3
  const delays: number[] = []
  let delay = Math.max(1, options.initialDelayMs)

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const jitter = delay * jitterRatio * Math.random()
    delays.push(Math.min(options.maxDelayMs, Math.round(delay + jitter)))
    delay = Math.min(options.maxDelayMs, delay * factor)
  }

  return { delays, totalAttempts: delays.length }
}

export class ExponentialBackoff {
  private attempt = 0
  private timer: unknown = null
  private cancelled = false
  private running = false

  constructor(
    private readonly options: BackoffOptions,
    private readonly clock: BackoffClock = SYSTEM_CLOCK,
  ) {}

  get currentAttempt(): number {
    return this.attempt
  }

  reset(): void {
    this.attempt = 0
  }

  isCancelled(): boolean {
    return this.cancelled
  }

  cancel(): void {
    this.cancelled = true
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer)
      this.timer = null
    }
  }

  schedule(callback: () => void): number | null {
    if (this.cancelled || this.running) return null

    this.attempt++
    if (this.attempt > this.options.maxAttempts) {
      this.cancelled = true
      return null
    }

    const { delays } = computeBackoffDelays(this.options)
    const delay = delays[this.attempt - 1] ?? this.options.maxDelayMs
    this.running = true

    this.timer = this.clock.setTimeout(() => {
      this.timer = null
      this.running = false
      callback()
    }, delay)

    return delay
  }
}
