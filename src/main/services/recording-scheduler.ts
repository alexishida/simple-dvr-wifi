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

  constructor(
    private readonly reconcile: () => Promise<void>,
    private readonly intervalMs = 30_000,
  ) {}

  start(): void {
    if (this.timer) return
    void this.run()
    this.timer = setInterval(() => void this.run(), this.intervalMs)
  }

  async refresh(): Promise<void> {
    await this.run()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private async run(): Promise<void> {
    if (this.pending) return this.pending
    const pending = this.reconcile().finally(() => {
      if (this.pending === pending) this.pending = null
    })
    this.pending = pending
    return pending
  }
}
