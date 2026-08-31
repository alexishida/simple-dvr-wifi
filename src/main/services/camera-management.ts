import type { DatabaseSupervisor } from '../supervisors/database.js'
import type { CredentialService } from './credentials.js'
import type { CameraRecord } from '../../shared/database.js'

export interface CameraDuplicateCheck {
  byAddress: CameraRecord | null
  byEpr: CameraRecord | null
  bySerial: CameraRecord | null
}

export interface CameraCreateInput {
  name: string
  host: string
  port?: number | null
  manufacturer?: string | null
  model?: string | null
  serialNumber?: string | null
  epr?: string | null
  rtspUrl?: string | null
  onvifUrl?: string | null
  snapshotUri?: string | null
  username?: string | null
  password?: string | null
  allowDuplicate?: boolean
}

export class CameraManagementService {
  constructor(
    private readonly database: DatabaseSupervisor,
    private readonly credentials: CredentialService,
  ) {}

  async checkDuplicates(input: {
    host?: string
    epr?: string | null
    serialNumber?: string | null
  }): Promise<CameraDuplicateCheck> {
    const [byAddress, byEpr, bySerial] = await Promise.all([
      input.host
        ? this.requestCamera('camera.findByHost', { host: input.host })
        : Promise.resolve(null),
      input.epr
        ? this.requestCamera('camera.findByEpr', { epr: input.epr })
        : Promise.resolve(null),
      input.serialNumber
        ? this.requestCamera('camera.findBySerial', { serialNumber: input.serialNumber })
        : Promise.resolve(null),
    ])
    return { byAddress, byEpr, bySerial }
  }

  private async requestCamera(channel: string, payload: unknown): Promise<CameraRecord | null> {
    const response = await this.database.request(channel, payload)
    if (!response.ok || response.value === null) return null
    return response.value as CameraRecord
  }

  async create(input: CameraCreateInput): Promise<{ camera: CameraRecord; duplicate: boolean }> {
    const duplicates = await this.checkDuplicates({
      host: input.host,
      epr: input.epr,
      serialNumber: input.serialNumber,
    })
    const blocked = Boolean(duplicates.byAddress || duplicates.byEpr || duplicates.bySerial)

    if (blocked && !input.allowDuplicate) {
      return {
        camera: duplicates.byAddress ?? duplicates.byEpr ?? duplicates.bySerial!,
        duplicate: true,
      }
    }

    const endpoints = []
    if (input.onvifUrl) endpoints.push({ service: 'onvif', url: input.onvifUrl })
    if (input.rtspUrl) endpoints.push({ service: 'rtsp', url: input.rtspUrl })
    if (input.snapshotUri) endpoints.push({ service: 'snapshot', url: input.snapshotUri })

    const response = await this.database.request('camera.create', {
      name: input.name,
      host: input.host,
      port: input.port ?? null,
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      serialNumber: input.serialNumber ?? null,
      epr: input.epr ?? null,
      endpoints,
    })
    if (!response.ok) {
      throw new Error('Não foi possível cadastrar a câmera.')
    }
    const camera = response.value as CameraRecord

    if (input.username && input.password) {
      await this.credentials.setCredential(camera.id, {
        service: 'onvif',
        password: input.password,
      })
      if (input.rtspUrl) {
        await this.credentials.setCredential(camera.id, {
          service: 'rtsp',
          password: input.password,
        })
      }
    }

    return { camera, duplicate: false }
  }

  async updateCredentials(
    cameraId: string,
    input: { password?: string | null; rtspPassword?: string | null },
  ): Promise<void> {
    if (input.password) {
      await this.credentials.setCredential(cameraId, { service: 'onvif', password: input.password })
    }
    if (input.rtspPassword) {
      await this.credentials.setCredential(cameraId, {
        service: 'rtsp',
        password: input.rtspPassword,
      })
    }
  }

  async updateAddress(
    cameraId: string,
    input: { host?: string; port?: number | null },
  ): Promise<CameraRecord | null> {
    const response = await this.database.request('camera.update', {
      id: cameraId,
      host: input.host ?? undefined,
      port: input.port ?? null,
    })
    if (!response.ok) return null
    return response.value as CameraRecord
  }

  async deactivate(cameraId: string): Promise<boolean> {
    const response = await this.database.request('camera.deactivate', { id: cameraId })
    return response.ok
  }

  async reactivate(cameraId: string): Promise<boolean> {
    const response = await this.database.request('camera.activate', { id: cameraId })
    return response.ok
  }

  async remove(cameraId: string): Promise<{ removed: boolean; credentialsRemoved: boolean }> {
    await this.credentials.removeCredential(cameraId)
    const response = await this.database.request('camera.remove', { id: cameraId })
    return { removed: response.ok, credentialsRemoved: true }
  }
}
