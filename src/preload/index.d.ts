import type {
  CameraEditDetails,
  CameraSummary,
  Result,
} from "../shared/contracts.js";
import type { AppConfig } from "../shared/config.js";
import type {
  DiagnosticRecord,
  RecordingRecord,
  SnapshotRecord,
} from "../shared/database.js";
import type { EventListener, Unsubscribe } from "../shared/events.js";

export interface NetworkInterfaceEntry {
  name: string;
  category: string;
  addresses: string[];
  mac: string | null;
  eligible: boolean;
}

export interface DiscoveryCameraResult {
  epr: string;
  addresses: string[];
  types: string[];
  scopes: string[];
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
}

export interface CameraApi {
  list: () => Promise<Result<CameraSummary[]>>;
  onChanged: (listener: EventListener<"cameras:changed">) => Unsubscribe;
  details: (id: string) => Promise<Result<CameraEditDetails>>;
  create: (input: CameraCreateInput) => Promise<Result<CameraCreateResult>>;
  checkDuplicate: (input: {
    host?: string;
    serialNumber?: string;
    epr?: string;
  }) => Promise<Result<unknown>>;
  test: (id: string) => Promise<Result<CameraTestResult>>;
  testConnection: (input: {
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
  }) => Promise<Result<{ updated: boolean }>>;
  deactivate: (id: string) => Promise<Result<boolean>>;
  reactivate: (id: string) => Promise<Result<boolean>>;
  updateCredentials: (input: {
    id: string;
    username?: string | null;
    password?: string | null;
    rtspPassword?: string | null;
  }) => Promise<Result<boolean>>;
  remove: (id: string) => Promise<Result<{ removed: boolean }>>;
}

export interface ConfigApi {
  get: () => Promise<Result<AppConfig | null>>;
  save: (config: AppConfig) => Promise<Result<{ saved: boolean }>>;
}

export interface DiagnosticsApi {
  list: () => Promise<Result<DiagnosticRecord[]>>;
}

export interface DiscoveryApi {
  interfaces: () => Promise<Result<NetworkInterfaceEntry[]>>;
  start: (input: {
    interfaceName: string;
    timeoutMs?: number;
  }) => Promise<Result<DiscoveryCameraResult[]>>;
  cancel: () => Promise<Result<{ cancelled: boolean }>>;
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
  move: (
    cameraId: string,
    velocity: PtzVelocityInput,
  ) => Promise<Result<{ started: boolean }>>;
  stop: (cameraId: string, trigger: PtzStopTrigger) => Promise<Result<void>>;
  status: (cameraId: string) => Promise<Result<PtzControlSnapshot | null>>;
}

export interface SnapshotCaptureResult {
  ok?: boolean;
  path?: string;
  relativePath?: string;
  bytes?: number;
  capturedAt?: string;
  source?: "endpoint" | "ffmpeg";
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
}

export interface RecordingApi {
  start: (cameraId: string) => Promise<Result<RecordingSessionResult>>;
  stop: (cameraId: string) => Promise<Result<{ stopped: boolean }>>;
}

export type RecordingLibraryItem = RecordingRecord & { path: string | null };

export interface LibraryApi {
  snapshots: (cameraId?: string) => Promise<Result<SnapshotRecord[]>>;
  recordings: (cameraId?: string) => Promise<Result<RecordingLibraryItem[]>>;
  openSnapshot: (path: string) => Promise<Result<{ opened: boolean }>>;
  openRecording: (path: string) => Promise<Result<{ opened: boolean }>>;
}

export interface ExposedApi {
  cameras: CameraApi;
  config: ConfigApi;
  diagnostics: DiagnosticsApi;
  discovery: DiscoveryApi;
  media: MediaApi;
  ptz: PtzApi;
  snapshots: SnapshotApi;
  recordings: RecordingApi;
  library: LibraryApi;
  shell: ShellApi;
}

declare global {
  interface Window {
    api: ExposedApi;
  }
}
