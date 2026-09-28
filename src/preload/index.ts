import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  CameraEditDetails,
  CameraSummary,
  Result,
} from "../shared/contracts.js";
import type { AppConfig } from "../shared/config.js";
import type { SdCardCamera, SdCardRecording } from '../shared/sd-card.js';
import type {
  CameraRecord,
  MediaKind,
  MediaMetadata,
  MediaMetadataInput,
  RecordingRecord,
  RecordingSegmentRecord,
  SnapshotRecord,
} from "../shared/database.js";
import {
  EVENT_CHANNELS,
  type EventChannel,
  type EventListener,
  type EventPayloadMap,
  type Unsubscribe,
} from "../shared/events.js";

export interface CameraCreateInput {
  name: string;
  host: string;
  port?: number | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  epr?: string | null;
  rtspUrl?: string | null;
  onvifUrl?: string | null;
  snapshotUri?: string | null;
  username?: string | null;
  password?: string | null;
  allowDuplicate?: boolean;
}

export interface CameraDuplicateInput {
  host?: string;
  serialNumber?: string;
  epr?: string;
}

export interface CameraCreateResult {
  ok: boolean;
  camera?: CameraSummary;
  duplicate?: boolean;
}

export interface CameraDuplicateResult {
  ok: boolean;
  byAddress?: CameraRecord | null;
  byEpr?: CameraRecord | null;
  bySerial?: CameraRecord | null;
}

export interface CameraTestResult {
  status: CameraSummary["status"];
  segments: Array<{
    name: "onvif" | "rtsp";
    status: "ok" | "error" | "skipped";
    detail: string;
  }>;
}

export interface MediaSessionStatus {
  state:
    | "starting"
    | "running"
    | "stopping"
    | "stopped"
    | "crashed"
    | "circuit_open";
  restarts: number;
  error: string | null;
}

export interface PtzControlSnapshot {
  cameraId: string | null;
  moving: boolean;
  movingSince: string | null;
  stopBlocked: boolean;
  stopFailures: number;
  lastTrigger: string | null;
}

export interface PtzVelocityInput {
  pan?: number;
  tilt?: number;
  zoom?: number;
}

export type PtzStopTrigger =
  | "pointer_release"
  | "key_release"
  | "blur"
  | "unmount"
  | "camera_switch"
  | "failure"
  | "shutdown";

export interface SnapshotCaptureResult {
  ok?: boolean;
  snapshotId?: string;
  path?: string;
  relativePath?: string;
  bytes?: number;
  capturedAt?: string;
  source?: "endpoint" | "ffmpeg" | "video";
}

export interface RecordingSessionResult {
  ok?: boolean;
  recordingId?: string;
  cameraId?: string;
  status?: string;
  startedAt?: string;
  writeAllowed?: boolean;
}

export type RecordingLibraryItem = RecordingRecord & { path: string | null };

export interface LibraryFilter {
  cameraId?: string;
  startAt?: string;
  endAt?: string;
}

function subscribe<C extends EventChannel>(
  channel: C,
  listener: EventListener<C>,
): Unsubscribe {
  if (!EVENT_CHANNELS.includes(channel)) {
    throw new Error(`Event channel not allowed: ${channel}`);
  }
  const handler = (
    _event: IpcRendererEvent,
    payload: EventPayloadMap[C],
  ): void => {
    listener(payload);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  sdCard: {
    cameras: (): Promise<Result<SdCardCamera[]>> => ipcRenderer.invoke('sdCard:cameras'),
    list: (cameraId: string, date: string): Promise<Result<SdCardRecording[]>> => ipcRenderer.invoke('sdCard:list', { cameraId, date }),
    download: (cameraId: string, id: string): Promise<Result<{ path: string; imported: boolean }>> => ipcRenderer.invoke('sdCard:download', { cameraId, id }),
  },
  cameras: {
    list: (): Promise<Result<CameraSummary[]>> =>
      ipcRenderer.invoke("cameras:list"),
    details: (id: string): Promise<Result<CameraEditDetails>> =>
      ipcRenderer.invoke("cameras:details", { id }),
    onChanged: (listener: EventListener<"cameras:changed">): Unsubscribe =>
      subscribe("cameras:changed", listener),
    create: (input: CameraCreateInput): Promise<Result<CameraCreateResult>> =>
      ipcRenderer.invoke("cameras:create", input),
    checkDuplicate: (
      input: CameraDuplicateInput,
    ): Promise<Result<CameraDuplicateResult>> =>
      ipcRenderer.invoke("cameras:checkDuplicate", input),
    test: (id: string): Promise<Result<CameraTestResult>> =>
      ipcRenderer.invoke("cameras:test", { id }),
    testConnection: (input: {
      host: string;
      port?: number | null;
      rtspUrl?: string | null;
      onvifUrl?: string | null;
      username?: string | null;
      password?: string | null;
    }): Promise<Result<CameraTestResult>> =>
      ipcRenderer.invoke("cameras:testConnection", input),
    update: (input: {
      id: string;
      name: string;
      host: string;
      port?: number | null;
      rtspUrl?: string | null;
      onvifUrl?: string | null;
      username?: string | null;
      password?: string | null;
    }): Promise<Result<{ updated: boolean }>> =>
      ipcRenderer.invoke("cameras:update", input),
    deactivate: (id: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke("cameras:deactivate", { id }),
    reactivate: (id: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke("cameras:reactivate", { id }),
    updateCredentials: (input: {
      id: string;
      username?: string | null;
      password?: string | null;
      rtspPassword?: string | null;
    }): Promise<Result<boolean>> =>
      ipcRenderer.invoke("cameras:updateCredentials", input),
    remove: (id: string): Promise<Result<{ removed: boolean }>> =>
      ipcRenderer.invoke("cameras:remove", { id }),
  },
  config: {
    get: (): Promise<Result<AppConfig | null>> =>
      ipcRenderer.invoke("config:get"),
    save: (config: AppConfig): Promise<Result<{ saved: boolean }>> =>
      ipcRenderer.invoke("config:save", { config }),
  },
  media: {
    acquire: (input: {
      cameraId: string;
      profile: "main" | "sub";
    }): Promise<Result<MediaSessionStatus>> =>
      ipcRenderer.invoke("media:acquire", input),
    release: (
      cameraId: string,
      profile: "main" | "sub",
    ): Promise<Result<{ released: boolean }>> =>
      ipcRenderer.invoke("media:release", { cameraId, profile }),
    status: (cameraId: string): Promise<Result<MediaSessionStatus | null>> =>
      ipcRenderer.invoke("media:status", { cameraId }),
    whepEndpoint: (
      cameraId: string,
      profile: "main" | "sub",
    ): Promise<Result<{ url: string; token: string } | null>> =>
      ipcRenderer.invoke("media:whepEndpoint", { cameraId, profile }),
  },
  ptz: {
    connect: (cameraId: string): Promise<Result<{ connected: boolean }>> =>
      ipcRenderer.invoke("ptz:connect", { cameraId }),
    move: (
      cameraId: string,
      velocity: PtzVelocityInput,
    ): Promise<Result<{ started: boolean }>> =>
      ipcRenderer.invoke("ptz:move", { cameraId, velocity }),
    stop: (cameraId: string, trigger: PtzStopTrigger): Promise<Result<void>> =>
      ipcRenderer.invoke("ptz:stop", { cameraId, trigger }),
    status: (cameraId: string): Promise<Result<PtzControlSnapshot | null>> =>
      ipcRenderer.invoke("ptz:status", { cameraId }),
    listPresets: (cameraId: string): Promise<Result<Array<{ token: string; name: string }>>> => ipcRenderer.invoke("ptz:presets:list", { cameraId }),
    gotoPreset: (cameraId: string, presetToken: string): Promise<Result<{ moved: boolean }>> => ipcRenderer.invoke("ptz:presets:goto", { cameraId, presetToken }),
    setPreset: (cameraId: string, name: string, presetToken?: string): Promise<Result<{ token: string | null }>> => ipcRenderer.invoke("ptz:presets:set", { cameraId, name, presetToken }),
    removePreset: (cameraId: string, presetToken: string): Promise<Result<{ removed: boolean }>> => ipcRenderer.invoke("ptz:presets:remove", { cameraId, presetToken }),
  },
  snapshots: {
    capture: (input: {
      cameraId: string;
    }): Promise<Result<SnapshotCaptureResult>> =>
      ipcRenderer.invoke("snapshots:capture", input),
    saveFrame: (input: {
      cameraId: string;
      data: Uint8Array;
    }): Promise<Result<SnapshotCaptureResult>> =>
      ipcRenderer.invoke("snapshots:saveFrame", input),
  },
  recordings: {
    start: (cameraId: string): Promise<Result<RecordingSessionResult>> =>
      ipcRenderer.invoke("recordings:start", { cameraId }),
    stop: (
      cameraId: string,
    ): Promise<Result<{ stopped: boolean; saved: boolean }>> =>
      ipcRenderer.invoke("recordings:stop", { cameraId }),
    savePreview: (input: {
      cameraId: string;
      recordingId: string;
      data: Uint8Array;
    }): Promise<Result<{ saved: boolean }>> =>
      ipcRenderer.invoke("recordings:savePreview", input),
  },
  library: {
    storageUsage: (): Promise<Result<{
      freeBytes: number | null;
      totalBytes: number | null;
      usedBytes: number;
      byCamera: Array<{ cameraId: string; bytes: number }>;
    }>> => ipcRenderer.invoke("library:storageUsage"),
    snapshots: (filters: LibraryFilter = {}): Promise<Result<SnapshotRecord[]>> =>
      ipcRenderer.invoke("library:snapshots", filters),
    recordings: (
      filters: LibraryFilter = {},
    ): Promise<Result<RecordingLibraryItem[]>> =>
      ipcRenderer.invoke("library:recordings", filters),
    recordingSegments: (id: string): Promise<Result<RecordingSegmentRecord[]>> =>
      ipcRenderer.invoke("library:recordingSegments", { id }),
    metadata: (input: {
      kind: MediaKind;
      mediaId: string;
    }): Promise<Result<MediaMetadata | null>> =>
      ipcRenderer.invoke("library:metadata", input),
    updateMetadata: (
      input: MediaMetadataInput,
    ): Promise<Result<MediaMetadata>> =>
      ipcRenderer.invoke("library:updateMetadata", input),
    recordingPreview: (
      id: string,
    ): Promise<Result<{ dataUrl: string | null }>> =>
      ipcRenderer.invoke("library:recordingPreview", { id }),
    readRecording: (
      id: string,
    ): Promise<Result<{ data: Uint8Array; mimeType: string }>> =>
      ipcRenderer.invoke("library:readRecording", { id }),
    openSnapshot: (path: string): Promise<Result<{ opened: boolean }>> =>
      ipcRenderer.invoke("library:openSnapshot", { path }),
    openRecording: (path: string): Promise<Result<{ opened: boolean }>> =>
      ipcRenderer.invoke("library:openRecording", { path }),
    revealSnapshot: (id: string): Promise<Result<{ revealed: boolean }>> =>
      ipcRenderer.invoke("library:revealSnapshot", { id }),
    exportSnapshot: (id: string): Promise<Result<{ exported: boolean }>> =>
      ipcRenderer.invoke("library:exportSnapshot", { id }),
    revealRecording: (id: string): Promise<Result<{ revealed: boolean }>> =>
      ipcRenderer.invoke("library:revealRecording", { id }),
    exportRecording: (
      id: string,
    ): Promise<Result<{ exported: boolean; files: number }>> =>
      ipcRenderer.invoke("library:exportRecording", { id }),
    exportClip: (input: {
      id: string;
      jobId: string;
      startAt: string;
      endAt: string;
    }): Promise<Result<{
      exported: boolean;
      jobId: string;
      gaps: Array<{ startsAt: string; endsAt: string }>;
    }>> => ipcRenderer.invoke("library:exportClip", input),
    cancelClipExport: (jobId: string): Promise<Result<{ cancelled: boolean }>> =>
      ipcRenderer.invoke("library:cancelClipExport", { jobId }),
    clipExportStatus: (jobId: string): Promise<Result<{ active: boolean; percent: number }>> =>
      ipcRenderer.invoke("library:clipExportStatus", { jobId }),
    deleteSnapshot: (id: string): Promise<Result<{ deleted: boolean }>> =>
      ipcRenderer.invoke("library:deleteSnapshot", { id }),
    deleteRecording: (id: string): Promise<Result<{ deleted: boolean }>> =>
      ipcRenderer.invoke("library:deleteRecording", { id }),
  },
  shell: {
    openExternal: (url: string): Promise<Result<{ opened: boolean }>> =>
      ipcRenderer.invoke("shell:openExternal", { url }),
  },
  alerts: {
    list: () => ipcRenderer.invoke("alerts:list"),
    dismiss: (id: string) => ipcRenderer.invoke("alerts:dismiss", { id }),
  },
  retention: {
    status: () => ipcRenderer.invoke("retention:status"),
  },
  schedules: {
    list: (cameraId: string) => ipcRenderer.invoke("schedules:list", { cameraId }),
    replace: (input: { cameraId: string; periods: Array<{ weekday: number; start: string; end: string; enabled: boolean }> }) => ipcRenderer.invoke("schedules:replace", input),
    status: (cameraId: string) => ipcRenderer.invoke("schedules:status", { cameraId }),
  },
};

contextBridge.exposeInMainWorld("api", api);
