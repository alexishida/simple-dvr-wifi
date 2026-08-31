import { PtzControlService } from './ptz-control.js'
import {
  PtzCommandGuard,
  ptzCapabilitiesFromOnvif,
  type PtzServiceInterface,
} from '../../workers/camera/ptz-adapter.js'
import type { PtzVelocity } from '../../workers/camera/ptz-velocity.js'

export interface PtzAdapterProvider {
  getAdapter(cameraId: string): Promise<PtzServiceInterface | null>
}

export class PtzControllerRegistry {
  private readonly controllers = new Map<string, PtzControlService>()

  constructor(private readonly adapterProvider: PtzAdapterProvider) {}

  private async getOrCreate(
    cameraId: string,
    ptzSupported: boolean,
  ): Promise<PtzControlService | null> {
    const existing = this.controllers.get(cameraId)
    if (existing) return existing

    const adapter = await this.adapterProvider.getAdapter(cameraId)
    if (!adapter || !ptzSupported) return null

    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), adapter)
    const controller = new PtzControlService(guard, 'main')
    this.controllers.set(cameraId, controller)
    return controller
  }

  async move(
    cameraId: string,
    velocity: PtzVelocity,
    ptzSupported: boolean,
  ): Promise<{ started: boolean }> {
    const controller = await this.getOrCreate(cameraId, ptzSupported)
    if (!controller) return { started: false }
    if (controller.isMoving) {
      await controller.renew(cameraId, velocity)
    } else {
      await controller.startMove(cameraId, velocity)
    }
    return { started: true }
  }

  async stop(
    cameraId: string,
    trigger:
      | 'pointer_release'
      | 'key_release'
      | 'blur'
      | 'unmount'
      | 'camera_switch'
      | 'failure'
      | 'shutdown',
  ): Promise<void> {
    const controller = this.controllers.get(cameraId)
    if (!controller) return
    await controller.stop(trigger)
  }

  state(cameraId: string) {
    const controller = this.controllers.get(cameraId)
    return controller ? controller.state : null
  }

  async release(cameraId: string): Promise<void> {
    const controller = this.controllers.get(cameraId)
    if (!controller) return
    await controller.shutdown()
    this.controllers.delete(cameraId)
  }

  async shutdownAll(): Promise<void> {
    await Promise.all([...this.controllers.keys()].map((id) => this.release(id)))
  }
}
