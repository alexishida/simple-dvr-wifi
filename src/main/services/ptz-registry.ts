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
  private readonly pendingControllers = new Map<string, Promise<PtzControlService | null>>()
  private readonly operationQueues = new Map<string, Promise<void>>()

  constructor(private readonly adapterProvider: PtzAdapterProvider) {}

  private async enqueue<T>(cameraId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueues.get(cameraId) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const settled = result.then(
      () => undefined,
      () => undefined,
    )
    this.operationQueues.set(cameraId, settled)
    try {
      return await result
    } finally {
      if (this.operationQueues.get(cameraId) === settled) this.operationQueues.delete(cameraId)
    }
  }

  private async getOrCreate(
    cameraId: string,
    ptzSupported: boolean,
  ): Promise<PtzControlService | null> {
    const existing = this.controllers.get(cameraId)
    if (existing) return existing
    if (!ptzSupported) return null

    const pending = this.pendingControllers.get(cameraId)
    if (pending) return pending

    const creation = this.adapterProvider
      .getAdapter(cameraId)
      .then((adapter) => {
        if (!adapter) return null
        const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), adapter)
        const controller = new PtzControlService(guard, 'main')
        this.controllers.set(cameraId, controller)
        return controller
      })
      .finally(() => {
        if (this.pendingControllers.get(cameraId) === creation) {
          this.pendingControllers.delete(cameraId)
        }
      })
    this.pendingControllers.set(cameraId, creation)
    return creation
  }

  async move(
    cameraId: string,
    velocity: PtzVelocity,
    ptzSupported: boolean,
  ): Promise<{ started: boolean }> {
    return this.enqueue(cameraId, async () => {
      const controller = await this.getOrCreate(cameraId, ptzSupported)
      if (!controller) return { started: false }
      if (controller.isMoving) {
        await controller.renew(cameraId, velocity)
      } else {
        await controller.startMove(cameraId, velocity)
      }
      return { started: true }
    })
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
    return this.enqueue(cameraId, async () => {
      const controller =
        this.controllers.get(cameraId) ??
        (await this.pendingControllers.get(cameraId)?.catch(() => null))
      if (!controller) return
      await controller.stop(trigger)
    })
  }

  state(cameraId: string) {
    const controller = this.controllers.get(cameraId)
    return controller ? controller.state : null
  }

  async release(cameraId: string): Promise<void> {
    return this.enqueue(cameraId, async () => {
      await this.pendingControllers.get(cameraId)?.catch(() => undefined)
      const controller = this.controllers.get(cameraId)
      if (!controller) return
      await controller.shutdown()
      this.controllers.delete(cameraId)
    })
  }

  async shutdownAll(): Promise<void> {
    await Promise.all(
      [...this.pendingControllers.values()].map((pending) => pending.catch(() => null)),
    )
    await Promise.all([...this.controllers.keys()].map((id) => this.release(id)))
  }
}
