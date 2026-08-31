import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { CameraSummary, Result } from '../shared/contracts.js'
import type { AppConfig } from '../shared/config.js'
import type { CameraRecord, DiagnosticRecord } from '../shared/database.js'
import {
  EVENT_CHANNELS,
  type EventChannel,
  type EventListener,
  type EventPayloadMap,
  type Unsubscribe,
} from '../shared/events.js'

export interface NetworkInterfaceEntry {
  name: string
  category: string
  addresses: string[]
  mac: string | null
  eligible: boolean
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

export interface CameraDuplicateInput {
  host?: string
  serialNumber?: string
  epr?: string
}

export interface CameraCreateResult {
  ok: boolean
  camera?: CameraSummary
  duplicate?: boolean
}

export interface CameraDuplicateResult {
  ok: boolean
  byAddress?: CameraRecord | null
  byEpr?: CameraRecord | null
  bySerial?: CameraRecord | null
}

export interface DiscoveryCameraResult {
  epr: string
  addresses: string[]
  types: string[]
  scopes: string[]
}

export interface MediaSessionStatus {
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed' | 'circuit_open'
  restarts: number
  error: string | null
}

export interface PtzControlSnapshot {
  cameraId: string | null
  moving: boolean
  movingSince: string | null
  stopBlocked: boolean
  stopFailures: number
  lastTrigger: string | null
}

export interface PtzVelocityInput {
  pan?: number
  tilt?: number
  zoom?: number
}

export type PtzStopTrigger =
  'pointer_release' | 'key_release' | 'blur' | 'unmount' | 'camera_switch' | 'failure' | 'shutdown'

export interface SnapshotCaptureResult {
  ok?: boolean
  path?: string
  relativePath?: string
  bytes?: number
  capturedAt?: string
  source?: 'endpoint' | 'ffmpeg'
}

export interface RecordingSessionResult {
  ok?: boolean
  recordingId?: string
  cameraId?: string
  status?: string
  startedAt?: string
  writeAllowed?: boolean
}

function subscribe<C extends EventChannel>(channel: C, listener: EventListener<C>): Unsubscribe {
  if (!EVENT_CHANNELS.includes(channel)) {
    throw new Error(`Event channel not allowed: ${channel}`)
  }
  const handler = (_event: IpcRendererEvent, payload: EventPayloadMap[C]): void => {
    listener(payload)
  }
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api = {
  cameras: {
    list: (): Promise<Result<CameraSummary[]>> => ipcRenderer.invoke('cameras:list'),
    onChanged: (listener: EventListener<'cameras:changed'>): Unsubscribe =>
      subscribe('cameras:changed', listener),
    create: (input: CameraCreateInput): Promise<Result<CameraCreateResult>> =>
      ipcRenderer.invoke('cameras:create', input),
    checkDuplicate: (input: CameraDuplicateInput): Promise<Result<CameraDuplicateResult>> =>
      ipcRenderer.invoke('cameras:checkDuplicate', input),
    deactivate: (id: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke('cameras:deactivate', { id }),
    reactivate: (id: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke('cameras:reactivate', { id }),
    updateCredentials: (input: {
      id: string
      password?: string | null
      rtspPassword?: string | null
    }): Promise<Result<boolean>> => ipcRenderer.invoke('cameras:updateCredentials', input),
    remove: (id: string): Promise<Result<{ removed: boolean }>> =>
      ipcRenderer.invoke('cameras:remove', { id }),
  },
  config: {
    get: (): Promise<Result<AppConfig | null>> => ipcRenderer.invoke('config:get'),
    save: (config: AppConfig): Promise<Result<{ saved: boolean }>> =>
      ipcRenderer.invoke('config:save', { config }),
  },
  diagnostics: {
    list: (): Promise<Result<DiagnosticRecord[]>> => ipcRenderer.invoke('diagnostics:list'),
  },
  discovery: {
    interfaces: (): Promise<Result<NetworkInterfaceEntry[]>> =>
      ipcRenderer.invoke('discovery:interfaces'),
    start: (input: {
      interfaceName: string
      timeoutMs?: number
    }): Promise<Result<DiscoveryCameraResult[]>> => ipcRenderer.invoke('discovery:start', input),
    cancel: (): Promise<Result<{ cancelled: boolean }>> => ipcRenderer.invoke('discovery:cancel'),
  },
  media: {
    acquire: (input: {
      cameraId: string
      rtspUrl: string
      path: string
    }): Promise<Result<MediaSessionStatus>> => ipcRenderer.invoke('media:acquire', input),
    release: (cameraId: string): Promise<Result<{ released: boolean }>> =>
      ipcRenderer.invoke('media:release', { cameraId }),
    status: (cameraId: string): Promise<Result<MediaSessionStatus | null>> =>
      ipcRenderer.invoke('media:status', { cameraId }),
    whepEndpoint: (
      cameraId: string,
      profile: 'main' | 'sub',
    ): Promise<Result<{ url: string; token: string } | null>> =>
      ipcRenderer.invoke('media:whepEndpoint', { cameraId, profile }),
  },
  ptz: {
    move: (cameraId: string, velocity: PtzVelocityInput): Promise<Result<{ started: boolean }>> =>
      ipcRenderer.invoke('ptz:move', { cameraId, velocity }),
    stop: (cameraId: string, trigger: PtzStopTrigger): Promise<Result<void>> =>
      ipcRenderer.invoke('ptz:stop', { cameraId, trigger }),
    status: (cameraId: string): Promise<Result<PtzControlSnapshot | null>> =>
      ipcRenderer.invoke('ptz:status', { cameraId }),
  },
  snapshots: {
    capture: (input: {
      cameraId: string
      snapshotUri?: string | null
      rtspUrl?: string | null
    }): Promise<Result<SnapshotCaptureResult>> => ipcRenderer.invoke('snapshots:capture', input),
  },
  recordings: {
    start: (cameraId: string): Promise<Result<RecordingSessionResult>> =>
      ipcRenderer.invoke('recordings:start', { cameraId }),
    stop: (cameraId: string): Promise<Result<{ stopped: boolean }>> =>
      ipcRenderer.invoke('recordings:stop', { cameraId }),
  },
  shell: {
    openExternal: (url: string): Promise<Result<{ opened: boolean }>> =>
      ipcRenderer.invoke('shell:openExternal', { url }),
  },
}

contextBridge.exposeInMainWorld('api', api)
