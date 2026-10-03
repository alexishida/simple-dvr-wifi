import type {
  CameraEditDetails,
  CameraMetrics,
  CameraSummary,
  Result,
} from "../shared/contracts.js";
import type { AppConfig } from "../shared/config.js";
import type { DashboardGroup, DashboardLayout } from "../shared/dashboard-layout.js";
import type { SdCardCamera, SdCardRecording } from '../shared/sd-card.js';
import type {
  MediaKind,
  MediaMetadata,
  MediaMetadataInput,
  MotionEventFilter,
  MotionEventRecord,
  RecordingRecord,
  RecordingSegmentRecord,
  SnapshotRecord,
} from "../shared/database.js";
import type { EventListener, Unsubscribe } from "../shared/events.js";

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
  sdCardUsername?: string | null;
  sdCardPassword?: string | null;
  allowDuplicate?: boolean;
}

export interface CameraCreateResult {
  ok: boolean;
  camera?: CameraSummary;
  duplicate?: boolean;
}

export interface CameraTestResult {
  status: CameraSummary["status"];
  segments: Array<{
    name: "onvif" | "rtsp";
    status: "ok" | "error" | "skipped";
    detail: string;
  }>;
  identified?: {
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    rtspUrl: string | null;
    source: "onvif" | "reference" | null;
  } | null;
}

export interface DiscoveryInterface {
  name: string;
  address: string;
}

export interface DiscoveredOnvifDevice {
  endpointReference: string | null;
  host: string;
  onvifUrl: string;
  scopes: string[];
  types: string[];
}

export interface CameraApi {
  list: () => Promise<Result<CameraSummary[]>>;
  onChanged: (listener: EventListener<"cameras:changed">) => Unsubscribe;
  details: (id: string) => Promise<Result<CameraEditDetails>>;
  metrics: (id: string) => Promise<Result<CameraMetrics>>;
  discoveryInterfaces: () => Promise<Result<DiscoveryInterface[]>>;
  discover: (input: { requestId: string; address?: string }) => Promise<Result<DiscoveredOnvifDevice[]>>;
  cancelDiscovery: (requestId: string) => Promise<Result<{ cancelled: boolean }>>;
  create: (input: CameraCreateInput) => Promise<Result<CameraCreateResult>>;
  checkDuplicate: (input: {
    host?: string;
    serialNumber?: string;
    epr?: string;
  }) => Promise<Result<unknown>>;
  test: (id: string) => Promise<Result<CameraTestResult>>;
  testConnection: (input: {
    cameraId?: string;
    host: string;
    port?: number | null;
    rtspUrl?: string | null;
    onvifUrl?: string | null;
    username?: string | null;
    password?: string | null;
  }) => Promise<Result<CameraTestResult>>;
  update: (input: {
    id: string;
    name: string;
    host: string;
    port?: number | null;
    rtspUrl?: string | null;
    onvifUrl?: string | null;
    username?: string | null;
    password?: string | null;
    sdCardUsername?: string | null;
    sdCardPassword?: string | null;
  }) => Promise<Result<{ updated: boolean }>>;
  deactivate: (id: string) => Promise<Result<boolean>>;
  reactivate: (id: string) => Promise<Result<boolean>>;
  updateCredentials: (input: {
    id: string;
    username?: string | null;
    password?: string | null;
    rtspPassword?: string | null;
    sdCardUsername?: string | null;
    sdCardPassword?: string | null;
  }) => Promise<Result<boolean>>;
  remove: (id: string) => Promise<Result<{ removed: boolean }>>;
}

export interface ConfigApi {
  get: () => Promise<Result<AppConfig | null>>;
  save: (config: AppConfig) => Promise<Result<{ saved: boolean }>>;
}

export interface ShellApi {
  openExternal: (url: string) => Promise<Result<{ opened: boolean }>>;
}

export interface MediaApi {
  acquire: (input: {
    cameraId: string;
    profile: "main" | "sub";
  }) => Promise<Result<MediaSessionStatus>>;
  release: (
    cameraId: string,
    profile: "main" | "sub",
  ) => Promise<Result<{ released: boolean }>>;
  status: (cameraId: string) => Promise<Result<MediaSessionStatus | null>>;
  whepEndpoint: (
    cameraId: string,
    profile: "main" | "sub",
  ) => Promise<Result<{ url: string; token: string } | null>>;
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

export interface PtzControlSnapshot {
  cameraId: string | null;
  moving: boolean;
  movingSince: string | null;
  stopBlocked: boolean;
  stopFailures: number;
  lastTrigger: string | null;
}

export interface PtzApi {
  connect: (cameraId: string) => Promise<Result<{ connected: boolean }>>;
  move: (
    cameraId: string,
    velocity: PtzVelocityInput,
  ) => Promise<Result<{ started: boolean }>>;
  stop: (cameraId: string, trigger: PtzStopTrigger) => Promise<Result<void>>;
  status: (cameraId: string) => Promise<Result<PtzControlSnapshot | null>>;
  listPresets: (cameraId: string) => Promise<Result<Array<{ token: string; name: string }>>>;
  gotoPreset: (cameraId: string, presetToken: string) => Promise<Result<{ moved: boolean }>>;
  setPreset: (cameraId: string, name: string, presetToken?: string) => Promise<Result<{ token: string | null }>>;
  removePreset: (cameraId: string, presetToken: string) => Promise<Result<{ removed: boolean }>>;
}

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

export interface SnapshotApi {
  capture: (input: {
    cameraId: string;
  }) => Promise<Result<SnapshotCaptureResult>>;
  saveFrame: (input: {
    cameraId: string;
    data: Uint8Array;
  }) => Promise<Result<SnapshotCaptureResult>>;
}

export interface RecordingApi {
  start: (cameraId: string) => Promise<Result<RecordingSessionResult>>;
  stop: (
    cameraId: string,
  ) => Promise<Result<{ stopped: boolean; saved: boolean }>>;
  savePreview: (input: {
    cameraId: string;
    recordingId: string;
    data: Uint8Array;
  }) => Promise<Result<{ saved: boolean }>>;
}

export type RecordingLibraryItem = RecordingRecord & { path: string | null };

export interface LibraryFilter {
  cameraId?: string;
  startAt?: string;
  endAt?: string;
  occurrence?: "all" | "with-motion" | "without-motion";
}

export interface LibraryApi {
  storageUsage: () => Promise<Result<{
    freeBytes: number | null;
    totalBytes: number | null;
    usedBytes: number;
    byCamera: Array<{ cameraId: string; bytes: number }>;
  }>>;
  snapshots: (filters?: LibraryFilter) => Promise<Result<SnapshotRecord[]>>;
  recordings: (
    filters?: LibraryFilter,
  ) => Promise<Result<RecordingLibraryItem[]>>;
  recordingById: (id: string) => Promise<Result<RecordingLibraryItem | null>>;
  motionEvents: (filters: MotionEventFilter) => Promise<Result<MotionEventRecord[]>>;
  recordingSegments: (id: string) => Promise<Result<RecordingSegmentRecord[]>>;
  metadata: (input: {
    kind: MediaKind;
    mediaId: string;
  }) => Promise<Result<MediaMetadata | null>>;
  updateMetadata: (
    input: MediaMetadataInput,
  ) => Promise<Result<MediaMetadata>>;
  recordingPreview: (id: string) => Promise<Result<{ dataUrl: string | null }>>;
  readRecording: (
    id: string,
  ) => Promise<Result<{ data: Uint8Array; mimeType: string }>>;
  openSnapshot: (path: string) => Promise<Result<{ opened: boolean }>>;
  openRecording: (path: string) => Promise<Result<{ opened: boolean }>>;
  revealSnapshot: (id: string) => Promise<Result<{ revealed: boolean }>>;
  exportSnapshot: (id: string) => Promise<Result<{ exported: boolean }>>;
  revealRecording: (id: string) => Promise<Result<{ revealed: boolean }>>;
  exportRecording: (
    id: string,
  ) => Promise<Result<{ exported: boolean; files: number }>>;
  exportClip: (input: {
    id: string;
    jobId: string;
    startAt: string;
    endAt: string;
  }) => Promise<Result<{
    exported: boolean;
    jobId: string;
    gaps: Array<{ startsAt: string; endsAt: string }>;
  }>>;
  cancelClipExport: (jobId: string) => Promise<Result<{ cancelled: boolean }>>;
  clipExportStatus: (jobId: string) => Promise<Result<{ active: boolean; percent: number }>>;
  deleteSnapshot: (id: string) => Promise<Result<{ deleted: boolean }>>;
  deleteRecording: (id: string) => Promise<Result<{ deleted: boolean }>>;
}

export interface ExposedApi {
  sdCard: {
    cameras: () => Promise<Result<SdCardCamera[]>>;
    list: (cameraId: string, date: string) => Promise<Result<SdCardRecording[]>>;
    download: (cameraId: string, id: string) => Promise<Result<{ path: string; imported: boolean }>>;
  };
  cameras: CameraApi;
  config: ConfigApi;
  media: MediaApi;
  ptz: PtzApi;
  snapshots: SnapshotApi;
  recordings: RecordingApi;
  library: LibraryApi;
  shell: ShellApi;
  alerts: {
    list: () => Promise<Result<Array<{ id: string; kind: string; cameraId: string | null; message: string; count: number; firstOccurredAt: string; lastOccurredAt: string }>>>;
    dismiss: (id: string) => Promise<Result<{ dismissed: boolean }>>;
  };
  diagnostics: {
    export: () => Promise<Result<{ exported: boolean }>>;
  };
  backup: {
    export: () => Promise<Result<{
      exported: boolean;
      preview?: { bytes: number; cameras: number; recordings: number; snapshots: number; schedules: number; hasConfiguration: boolean; credentialsExcluded: boolean };
    }>>;
    inspectRestore: () => Promise<Result<{
      selected: boolean;
      token?: string;
      preview?: { bytes: number; cameras: number; recordings: number; snapshots: number; schedules: number; hasConfiguration: boolean; credentialsExcluded: boolean };
    }>>;
    restore: (token: string) => Promise<Result<{ scheduled: boolean }>>;
  };
  retention: {
    status: () => Promise<Result<{ lastRunAt: string | null; deleted: number; freedBytes: number; failures: number; noCandidates: boolean }>>;
  };
  schedules: {
    list: (cameraId: string) => Promise<Result<Array<{ id: string; weekday: number; start: string; end: string; enabled: boolean }>>>;
    replace: (input: { cameraId: string; periods: Array<{ weekday: number; start: string; end: string; enabled: boolean }> }) => Promise<Result<{ saved: boolean }>>;
    status: (cameraId: string) => Promise<Result<{ active: boolean; source: "manual" | "scheduled" | null; blocked: string | null; nextAt: string | null; appMustRun: boolean }>>;
  };
  dashboard: {
    saveGroup: (group: DashboardGroup) => Promise<Result<{ saved: boolean }>>;
    deleteGroup: (id: string) => Promise<Result<{ deleted: boolean }>>;
    saveLayout: (layout: DashboardLayout) => Promise<Result<{ saved: boolean }>>;
    deleteLayout: (id: string) => Promise<Result<{ deleted: boolean }>>;
  };
}

declare global {
  interface Window {
    api: ExposedApi;
  }
}
