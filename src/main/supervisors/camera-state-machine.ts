import { CameraStatusSchema } from '../../shared/contracts.js'

export type CameraStatus = (typeof CameraStatusSchema)['_output']

export type FailureCategory =
  'authentication' | 'network' | 'protocol' | 'media' | 'codec' | 'database' | 'storage'

export type CameraEvent =
  | { type: 'connect_start' }
  | { type: 'connect_success' }
  | { type: 'reconnect_start' }
  | { type: 'stable' }
  | { type: 'failure'; category: FailureCategory }
  | { type: 'disable' }
  | { type: 'enable' }

export interface TransitionResult {
  from: CameraStatus
  to: CameraStatus
  allowed: boolean
}

const FAILURE_TO_STATUS: Record<FailureCategory, CameraStatus> = {
  authentication: 'auth_error',
  network: 'network_error',
  protocol: 'network_error',
  media: 'media_error',
  codec: 'codec_error',
  database: 'unavailable',
  storage: 'unavailable',
}

export class CameraStateMachine {
  private status: CameraStatus = 'disabled'

  constructor(private readonly cameraId: string) {}

  get current(): CameraStatus {
    return this.status
  }

  private canTransition(event: CameraEvent): boolean {
    const from = this.status
    switch (event.type) {
      case 'enable':
        return from === 'disabled'
      case 'disable':
        return from !== 'disabled'
      case 'connect_start':
        return from === 'disconnected' || from === 'reconnecting'
      case 'connect_success':
        return from === 'connecting' || from === 'reconnecting'
      case 'reconnect_start':
        return (
          from === 'auth_error' ||
          from === 'network_error' ||
          from === 'media_error' ||
          from === 'codec_error' ||
          from === 'unavailable' ||
          from === 'disconnected' ||
          from === 'connected'
        )
      case 'stable':
        return from === 'connected' || from === 'reconnecting' || from === 'connecting'
      case 'failure':
        return from !== 'disabled'
    }
  }

  transition(event: CameraEvent): TransitionResult {
    const from = this.status
    if (!this.canTransition(event)) {
      return { from, to: from, allowed: false }
    }

    switch (event.type) {
      case 'enable':
        this.status = 'disconnected'
        break
      case 'disable':
        this.status = 'disabled'
        break
      case 'connect_start':
        this.status = 'connecting'
        break
      case 'connect_success':
        this.status = 'connected'
        break
      case 'reconnect_start':
        this.status = 'reconnecting'
        break
      case 'stable':
        this.status = 'connected'
        break
      case 'failure':
        this.status = FAILURE_TO_STATUS[event.category]
        break
    }

    return { from, to: this.status, allowed: true }
  }

  reset(): void {
    this.status = 'disabled'
  }

  describe(): { cameraId: string; status: CameraStatus } {
    return { cameraId: this.cameraId, status: this.status }
  }
}
