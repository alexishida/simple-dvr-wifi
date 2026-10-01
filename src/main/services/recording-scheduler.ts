import type { SchedulePeriod } from '../../shared/recording-schedule.js'
import { isScheduledAt } from '../../shared/recording-schedule.js'

export function shouldScheduleRecording(input: {
  periods: SchedulePeriod[]
  now: Date
  cameraActive: boolean
  manualRecording: boolean
  scheduledRecording: boolean
}): 'start' | 'stop' | 'none' {
  if (!input.cameraActive || input.manualRecording) return 'none'
  const scheduled = isScheduledAt(input.periods, input.now)
  if (scheduled && !input.scheduledRecording) return 'start'
  if (!scheduled && input.scheduledRecording) return 'stop'
  return 'none'
}

export class RecordingScheduler {
  private timer: NodeJS.Timeout | null = null
  private pending: Promise<void> | null = null
  private refreshRequested = false

  constructor(
    private readonly reconcile: () => Promise<void>,
    private readonly intervalMs = 30_000,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  start(): void {
    if (this.timer) return
    this.refreshInBackground()
    this.timer = setInterval(() => {
      if (!this.pending) this.refreshInBackground()
    }, this.intervalMs)
  }

  async refresh(): Promise<void> {
    this.refreshRequested = true
    await this.run()
  }

  refreshInBackground(): void {
    void this.refresh().catch(this.onError)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    this.refreshRequested = false
  }

  private async run(): Promise<void> {
    if (this.pending) return this.pending
    const pending = Promise.resolve().then(async () => {
      try {
        do {
          this.refreshRequested = false
          await this.reconcile()
        } while (this.refreshRequested)
      } finally {
        if (this.pending === pending) this.pending = null
      }
    })
    this.pending = pending
    return pending
  }
}
