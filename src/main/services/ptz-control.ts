import {
  normalizePtzVelocity,
  type NormalizedVelocity,
  type PtzVelocity,
} from '../../workers/camera/ptz-velocity.js'
import type { PtzCommandGuard, PtzServiceInterface } from '../../workers/camera/ptz-adapter.js'

export type PtzControlTrigger =
  | 'pointer_release'
  | 'key_release'
  | 'blur'
  | 'unmount'
  | 'camera_switch'
  | 'failure'
  | 'shutdown'
  | 'lease_expiry'

export interface PtzLeaseOptions {
  leaseMs?: number
  stopRetryLimit?: number
  clock?: {
    setTimeout(callback: () => void, delayMs: number): unknown
    clearTimeout(handle: unknown): void
  }
}

export interface PtzControlState {
  cameraId: string | null
  moving: boolean
  movingSince: string | null
  stopBlocked: boolean
  stopFailures: number
  lastTrigger: PtzControlTrigger | null
}

const DEFAULT_LEASE_MS = 1_500
const DEFAULT_STOP_RETRY_LIMIT = 3

const SYSTEM_CLOCK = {
  setTimeout: (callback: () => void, delayMs: number): NodeJS.Timeout =>
    setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown): void => clearTimeout(handle as NodeJS.Timeout),
}

function toVelocityRecord(velocity: NormalizedVelocity): Record<string, number> {
  const record: Record<string, number> = {}
  if (velocity.pan !== undefined) record.pan = velocity.pan
  if (velocity.tilt !== undefined) record.tilt = velocity.tilt
  if (velocity.zoom !== undefined) record.zoom = velocity.zoom
  return record
}

export class PtzControlService {
  private leaseTimer: unknown = null
  private cameraId: string | null = null
  private moving = false
  private movingSince: string | null = null
  private stopBlocked = false
  private stopFailures = 0
  private lastTrigger: PtzControlTrigger | null = null
  private readonly leaseMs: number
  private readonly stopRetryLimit: number
  private readonly clock: NonNullable<PtzLeaseOptions['clock']>

  constructor(
    private readonly guard: PtzCommandGuard,
    private readonly profileToken: string,
    options: PtzLeaseOptions = {},
  ) {
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    this.stopRetryLimit = options.stopRetryLimit ?? DEFAULT_STOP_RETRY_LIMIT
    this.clock = options.clock ?? SYSTEM_CLOCK
  }

  get state(): PtzControlState {
    return {
      cameraId: this.cameraId,
      moving: this.moving,
      movingSince: this.movingSince,
      stopBlocked: this.stopBlocked,
      stopFailures: this.stopFailures,
      lastTrigger: this.lastTrigger,
    }
  }

  async startMove(cameraId: string, rawVelocity: PtzVelocity): Promise<void> {
    const velocity = normalizePtzVelocity(rawVelocity)
    this.cameraId = cameraId
    await this.guard.continuousMove({
      profileToken: this.profileToken,
      velocity: toVelocityRecord(velocity),
    })

    this.moving = true
    this.movingSince = new Date().toISOString()
    this.stopBlocked = false
    this.scheduleLease()
  }

  async renew(cameraId: string, rawVelocity: PtzVelocity): Promise<void> {
    const velocity = normalizePtzVelocity(rawVelocity)
    if (this.stopBlocked) return
    if (this.cameraId !== cameraId || !this.moving) {
      await this.guard.continuousMove({
        profileToken: this.profileToken,
        velocity: toVelocityRecord(velocity),
      })
      this.cameraId = cameraId
      this.moving = true
      this.movingSince = new Date().toISOString()
    }
    this.scheduleLease()
  }

  private scheduleLease(): void {
    if (this.leaseTimer !== null) this.clock.clearTimeout(this.leaseTimer)
    this.leaseTimer = this.clock.setTimeout(() => {
      this.leaseTimer = null
      void this.stop('lease_expiry')
    }, this.leaseMs)
  }

  async stop(trigger: PtzControlTrigger): Promise<void> {
    this.lastTrigger = trigger
    if (this.leaseTimer !== null) {
      this.clock.clearTimeout(this.leaseTimer)
      this.leaseTimer = null
    }

    if (!this.moving) {
      return
    }

    try {
      await this.guard.stop({ profileToken: this.profileToken })
      this.moving = false
      this.movingSince = null
      this.stopBlocked = false
      this.stopFailures = 0
    } catch {
      this.stopFailures++
      this.moving = false
      this.movingSince = null
      if (this.stopFailures >= this.stopRetryLimit) {
        this.stopBlocked = true
      } else {
        // retry with a short delay while the connection allows
        this.scheduleStopRetry(trigger)
      }
    }
  }

  private scheduleStopRetry(trigger: PtzControlTrigger): void {
    this.leaseTimer = this.clock.setTimeout(() => {
      this.leaseTimer = null
      void this.retryStop(trigger)
    }, 300)
  }

  private async retryStop(trigger: PtzControlTrigger): Promise<void> {
    if (this.stopBlocked) return
    try {
      await this.guard.stop({ profileToken: this.profileToken })
      this.stopBlocked = false
      this.stopFailures = 0
    } catch {
      this.stopFailures++
      if (this.stopFailures >= this.stopRetryLimit) {
        this.stopBlocked = true
      } else {
        this.scheduleStopRetry(trigger)
      }
    }
  }

  async cameraChanged(newCameraId: string): Promise<void> {
    await this.stop('camera_switch')
    this.cameraId = newCameraId
  }

  async shutdown(): Promise<void> {
    await this.stop('shutdown')
    if (this.leaseTimer !== null) {
      this.clock.clearTimeout(this.leaseTimer)
      this.leaseTimer = null
    }
    this.cameraId = null
  }

  get isMoving(): boolean {
    return this.moving
  }

  get isStopBlocked(): boolean {
    return this.stopBlocked
  }
}

export function isPtzAdapterSupported(guard: PtzCommandGuard): boolean {
  return guard.canExecute('continuous')
}

export type { PtzServiceInterface }
