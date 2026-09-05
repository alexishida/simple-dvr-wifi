import type { CameraStatus, FailureCategory } from './camera-state-machine.js'
import { CameraStateMachine } from './camera-state-machine.js'
import { ExponentialBackoff, type BackoffClock } from './backoff.js'
import type {
  MediaSessionSupervisor,
  MediaSessionStatus,
} from './media-session.js'

export interface ReconnectMediaSessionOptions {
  cameraId: string
  rtspUrl: string
  path: string
  supervisor: MediaSessionSupervisor
  backoff: {
    initialDelayMs: number
    maxDelayMs: number
    maxAttempts: number
    jitterRatio?: number
  }
  clock?: BackoffClock
  stabilityMs?: number
}

export interface ReconnectStateSnapshot {
  cameraId: string
  status: CameraStatus
  mediaState: MediaSessionStatus | null
  attempts: number
  cancelled: boolean
}

export class ReconnectingMediaSession {
  private readonly stateMachine: CameraStateMachine
  private readonly backoff: ExponentialBackoff
  private cancelled = false
  private mediaState: MediaSessionStatus | null = null
  private stabilityTimer: unknown = null

  constructor(private readonly options: ReconnectMediaSessionOptions) {
    this.stateMachine = new CameraStateMachine(options.cameraId)
    this.backoff = new ExponentialBackoff(
      { ...options.backoff, jitterRatio: options.backoff.jitterRatio ?? 0.3 },
      options.clock,
    )
  }

  get state(): ReconnectStateSnapshot {
    return {
      cameraId: this.options.cameraId,
      status: this.stateMachine.current,
      mediaState: this.mediaState,
      attempts: this.backoff.currentAttempt,
      cancelled: this.cancelled,
    }
  }

  async start(): Promise<CameraStatus> {
    this.stateMachine.transition({ type: 'enable' })
    return this.connect()
  }

  private async connect(): Promise<CameraStatus> {
    if (this.cancelled) return this.stateMachine.current

    this.stateMachine.transition({ type: 'connect_start' })
    try {
      this.mediaState = await this.options.supervisor.acquire(
        this.options.cameraId,
        this.options.rtspUrl,
        this.options.path,
      )
      if (this.cancelled) return this.stateMachine.current

      if (this.mediaState.state === 'running') {
        this.stateMachine.transition({ type: 'connect_success' })
        this.scheduleStabilityReset()
        return this.stateMachine.current
      }

      // pipeline invalid (crashed/circuit_open): discard and schedule retry
      const category = this.categoryForMediaState(this.mediaState)
      this.stateMachine.transition({ type: 'failure', category })
      this.scheduleReconnect()
      return this.stateMachine.current
    } catch {
      this.stateMachine.transition({ type: 'failure', category: 'network' })
      this.scheduleReconnect()
      return this.stateMachine.current
    }
  }

  private scheduleReconnect(): void {
    if (this.cancelled) return
    this.clearStabilityTimer()
    const delay = this.backoff.schedule(() => {
      void this.connect()
    })
    if (delay !== null)
      this.stateMachine.transition({ type: 'reconnect_start' })
  }

  private scheduleStabilityReset(): void {
    this.clearStabilityTimer()
    const stabilityMs = this.options.stabilityMs ?? 30_000
    const clock = this.options.clock
    if (clock) {
      this.stabilityTimer = clock.setTimeout(() => {
        this.stabilityTimer = null
        this.backoff.reset()
        this.stateMachine.transition({ type: 'stable' })
      }, stabilityMs)
    } else {
      this.stabilityTimer = setTimeout(() => {
        this.stabilityTimer = null
        this.backoff.reset()
        this.stateMachine.transition({ type: 'stable' })
      }, stabilityMs)
    }
  }

  onPipelineFailure(category: FailureCategory): void {
    if (this.cancelled) return
    this.stateMachine.transition({ type: 'failure', category })
    this.scheduleReconnect()
  }

  async stop(): Promise<void> {
    this.cancelled = true
    this.backoff.cancel()
    this.clearStabilityTimer()
    this.stateMachine.transition({ type: 'disable' })
    await this.options.supervisor.release(this.options.cameraId)
  }

  private clearStabilityTimer(): void {
    if (this.stabilityTimer !== null) {
      if (this.options.clock) {
        this.options.clock.clearTimeout(this.stabilityTimer)
      } else {
        clearTimeout(this.stabilityTimer as NodeJS.Timeout)
      }
      this.stabilityTimer = null
    }
  }

  private categoryForMediaState(state: MediaSessionStatus): FailureCategory {
    if (state.error?.includes('Hash')) return 'network'
    if (state.error?.includes('Binário')) return 'media'
    return 'media'
  }
}
