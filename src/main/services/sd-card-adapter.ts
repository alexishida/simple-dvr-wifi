import type { CameraRecord } from '../../shared/database.js'
import type { SdCardRecording } from '../../shared/sd-card.js'
import type { DatabaseSupervisor } from '../supervisors/database.js'

export interface SdCardCredential {
  username: string
  password: string
}

export interface SdCardListRequest {
  camera: CameraRecord
  credential: SdCardCredential
  date: string
  libraryRoot: string
}

export interface SdCardDownloadRequest {
  camera: CameraRecord
  credential: SdCardCredential
  id: string
  libraryRoot: string
  ffmpegPath: string
  database: DatabaseSupervisor
}

export interface SdCardAdapter {
  readonly id: string
  supports(camera: CameraRecord): boolean
  detail(camera: CameraRecord): string
  list(input: SdCardListRequest): Promise<SdCardRecording[]>
  download(input: SdCardDownloadRequest): Promise<{ path: string; imported: boolean }>
}

export class SdCardAdapterRegistry {
  constructor(private readonly adapters: readonly SdCardAdapter[]) {}

  forCamera(camera: CameraRecord): SdCardAdapter | null {
    return this.adapters.find((adapter) => adapter.supports(camera)) ?? null
  }

  describe(camera: CameraRecord): { supported: boolean; detail: string } {
    const adapter = this.forCamera(camera)
    return adapter
      ? { supported: true, detail: adapter.detail(camera) }
      : { supported: false, detail: 'Consulta do cartão SD indisponível para este modelo.' }
  }
}
