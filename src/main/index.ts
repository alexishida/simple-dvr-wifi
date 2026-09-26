import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  protocol,
  session,
  shell,
  safeStorage,
  Tray,
} from "electron";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  realpath,
  stat,
  unlink,
} from "node:fs/promises";
import type { Dirent } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { is } from "@electron-toolkit/utils";
import { z } from "zod";
import { IpcRegistry, EmptyRequestSchema } from "./ipc/registry.js";
import { resolveRenderAsset } from "./security/paths.js";
import { configureNavigationSecurity } from "./security/navigation.js";
import {
  isAllowedNavigationUrl,
  devServerOrigin,
  PACKAGED_RENDERER_ORIGIN,
} from "./security/navigation-urls.js";
import { isSafeExternalUrl } from "./security/urls.js";
import { CSP_DIRECTIVES } from "./security/csp.js";
import { ShutdownCoordinator } from "./supervisors/shutdown.js";
import { DatabaseSupervisor } from "./supervisors/database.js";
import { createUtilityProcessTransport } from "./supervisors/database-utility-process.js";
import { CredentialService } from "./services/credentials.js";
import { SafeStorageMasterKeyStore } from "./security/vault.js";
import { ConfigRepository } from "./services/config.js";
import {
  loadHardwareAcceleration,
  saveHardwareAcceleration,
} from "./services/hardware-acceleration.js";
import { CameraManagementService } from "./services/camera-management.js";
import { MediaSessionSupervisor } from "./supervisors/media-session.js";
import { expectedMediaMtxHashFromManifest } from "../workers/media/mediamtx-config.js";
import { PtzControllerRegistry } from "./services/ptz-registry.js";
import { recordingFileResponse } from "./services/recording-stream.js";
import { ClipExportService } from "./services/clip-export.js";
import { FfmpegRunner } from "../workers/media/ffmpeg-runner.js";
import { LocalAlertCenter } from "./services/alert-center.js";
import { selectRetentionCandidates } from "./services/retention-policy.js";
import { SchedulePeriodSchema, isScheduledAt, nextScheduledAt, type SchedulePeriod } from "../shared/recording-schedule.js";
import { RecordingScheduler, shouldScheduleRecording } from "./services/recording-scheduler.js";
import { AppConfigSchema, type AppConfig } from "../shared/config.js";
import type { CameraEditDetails, CameraSummary } from "../shared/contracts.js";
import type {
  CameraRecord,
  MediaMetadata,
  RecordingRecord,
  RecordingSegmentRecord,
  SnapshotRecord,
} from "../shared/database.js";
import { MediaMetadataInputSchema } from "../shared/database.js";
import {
  parseHttpUrl,
  parseRtspUrl,
  rtspUrlWithCredentials,
} from "../shared/camera-urls.js";

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let isQuitting = false;
const shutdownCoordinator = new ShutdownCoordinator();
let shutdownStarted = false;
let database: DatabaseSupervisor | null = null;
let credentials: CredentialService | null = null;
let cameraManagement: CameraManagementService | null = null;
let mediaSupervisor: MediaSessionSupervisor | null = null;
let ptzRegistry: PtzControllerRegistry | null = null;
let config: AppConfig | null = null;
let configRepository: ConfigRepository | null = null;
const activeRecordings = new Map<
  string,
  { recordingId: string; startedAt: string; recordDir: string }
>();
const recordingSources = new Map<string, "manual" | "scheduled">();
const scheduleSuppressedUntil = new Map<string, number>();
let recordingScheduler: RecordingScheduler | null = null;
const activeViewSessions = new Set<string>();
const recordingOperations = new Map<string, Promise<void>>();
let clipExporter: ClipExportService | null = null;
let libraryStorageCache: {
  key: string;
  expiresAt: number;
  value: {
    freeBytes: number | null;
    totalBytes: number | null;
    usedBytes: number;
    byCamera: Array<{ cameraId: string; bytes: number }>;
  };
} | null = null;
let libraryMutation: Promise<void> = Promise.resolve();
let retentionStatus = { lastRunAt: null as string | null, deleted: 0, freedBytes: 0, failures: 0, noCandidates: true };
const localAlerts = new LocalAlertCenter();

async function withLibraryMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = libraryMutation;
  let release!: () => void;
  libraryMutation = new Promise<void>((resolveRelease) => { release = resolveRelease; });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

async function withRecordingLock<T>(
  cameraId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = recordingOperations.get(cameraId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  recordingOperations.set(cameraId, settled);
  try {
    return await result;
  } finally {
    if (recordingOperations.get(cameraId) === settled)
      recordingOperations.delete(cameraId);
  }
}

function mapCameraRecord(
  record: CameraRecord,
  hasCredential: boolean,
): CameraSummary {
  return {
    id: record.id,
    name: record.name,
    host: record.host,
    active: record.active,
    status: record.status,
    recordingStatus: record.recordingStatus,
    hasCredential,
    hasOnvif: record.endpoints.some((endpoint) => endpoint.service === "onvif"),
    supportsPtz: record.supportsPtz,
  };
}

async function getCameraRecord(cameraId: string): Promise<CameraRecord | null> {
  if (!database) return null;
  const response = await database.request("camera.get", { id: cameraId });
  return response.ok ? (response.value as CameraRecord) : null;
}

function sanitizedEndpointUrl(
  record: CameraRecord,
  service: "onvif" | "rtsp" | "rtsp_sub" | "snapshot",
): string | null {
  const value = record.endpoints.find(
    (endpoint) => endpoint.service === service,
  )?.url;
  if (!value) return null;
  const parsed =
    service === "rtsp" || service === "rtsp_sub"
      ? parseRtspUrl(value)
      : parseHttpUrl(value);
  return parsed?.sanitizedUrl ?? null;
}

async function cameraEditDetails(cameraId: string): Promise<CameraEditDetails> {
  const camera = await getCameraRecord(cameraId);
  if (!camera) throw new Error("Câmera não encontrada.");

  let username: string | null = null;
  if (credentials) {
    for (const service of ["rtsp", "onvif", "snapshot", "ptz"] as const) {
      try {
        const credential = await credentials.getCredentialDetails(
          cameraId,
          service,
        );
        if (credential?.username) {
          username = credential.username;
          break;
        }
      } catch {
        // A senha nunca é retornada; uma credencial inválida pode ser substituída no formulário.
      }
    }
  }

  return {
    id: camera.id,
    name: camera.name,
    host: camera.host,
    port: camera.port,
    onvifUrl: sanitizedEndpointUrl(camera, "onvif"),
    rtspUrl: sanitizedEndpointUrl(camera, "rtsp"),
    rtspSubUrl: sanitizedEndpointUrl(camera, "rtsp_sub"),
    snapshotUrl: sanitizedEndpointUrl(camera, "snapshot"),
    username,
    manufacturer: camera.manufacturer,
    model: camera.model,
    serialNumber: camera.serialNumber,
  };
}

async function cameraRtspUrl(
  camera: CameraRecord,
  profile: "main" | "sub" = "main",
): Promise<string | null> {
  const endpoint =
    profile === "sub"
      ? (camera.endpoints.find((item) => item.service === "rtsp_sub") ??
        camera.endpoints.find((item) => item.service === "rtsp"))
      : camera.endpoints.find((item) => item.service === "rtsp");
  if (!endpoint) return null;
  const credential = await cameraCredential(camera.id, "rtsp");
  return rtspUrlWithCredentials(endpoint.url, credential);
}

async function cameraCredential(
  cameraId: string,
  service: "onvif" | "rtsp" | "snapshot" | "ptz",
): Promise<{ username: string | null; password: string } | null> {
  if (!credentials) return null;
  const services = await credentials.listCredentialServices(cameraId);
  if (!services.includes(service)) {
    if (
      (service === "snapshot" || service === "rtsp" || service === "ptz") &&
      services.includes("onvif")
    ) {
      return credentials.getCredentialDetails(cameraId, "onvif");
    }
    return null;
  }
  return credentials.getCredentialDetails(cameraId, service);
}

function mediaPath(cameraId: string): string {
  return `camera_${cameraId.replaceAll("-", "")}`;
}

function mediaSessionId(cameraId: string, profile: "main" | "sub"): string {
  return `${cameraId}_${profile}`;
}

async function releaseCameraMedia(cameraId: string): Promise<void> {
  if (!mediaSupervisor) return;
  await Promise.all([
    mediaSupervisor.release(mediaSessionId(cameraId, "main")),
    mediaSupervisor.release(mediaSessionId(cameraId, "sub")),
  ]);
}

async function listCameraSummaries(): Promise<CameraSummary[]> {
  if (!database) throw new Error("Banco de dados indisponível.");
  const response = await database.request("camera.listAll", undefined);
  if (!response.ok) throw new Error(response.error.message);
  const summaries: CameraSummary[] = [];
  for (const record of response.value as CameraRecord[]) {
    summaries.push(
      mapCameraRecord(
        record,
        credentials ? await credentials.hasCredential(record.id) : false,
      ),
    );
  }
  return summaries;
}

async function emitCameraChanged(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("cameras:changed", await listCameraSummaries());
}

async function resolveLibraryFile(
  libraryRoot: string,
  requestedPath: string,
  allowedExtensions: ReadonlySet<string>,
): Promise<string> {
  const [root, target] = await Promise.all([
    realpath(libraryRoot),
    realpath(requestedPath),
  ]);
  const fromRoot = relative(root, target);
  if (!fromRoot || fromRoot.startsWith("..") || fromRoot.includes(":")) {
    throw new Error("Arquivo fora da biblioteca autorizada.");
  }
  if (!allowedExtensions.has(extname(target).toLowerCase())) {
    throw new Error("Tipo de arquivo não autorizado.");
  }
  const info = await stat(target);
  if (!info.isFile()) throw new Error("Arquivo da biblioteca não encontrado.");
  return target;
}

async function deleteLibraryFile(
  libraryRoot: string,
  requestedPath: string,
  allowedExtensions: ReadonlySet<string>,
): Promise<void> {
  try {
    const target = await resolveLibraryFile(
      libraryRoot,
      requestedPath,
      allowedExtensions,
    );
    await unlink(target);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

async function assertNewExportDestination(path: string): Promise<void> {
  try {
    await stat(path);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
  throw new Error("Já existe um arquivo com esse nome no destino escolhido.");
}

function bundledFfmpegPath(): string {
  return app.isPackaged
    ? resolve(process.resourcesPath, "ffmpeg", "win32", "ffmpeg.exe")
    : resolve(process.cwd(), "resources", "ffmpeg", "win32", "ffmpeg.exe");
}

function getClipExporter(): ClipExportService {
  if (clipExporter) return clipExporter;
  const binaryPath = bundledFfmpegPath();
  clipExporter = new ClipExportService(
    new FfmpegRunner(binaryPath),
    binaryPath,
    resolve(userDataPath, "export-temporary"),
  );
  return clipExporter;
}

async function runRetentionCleanup(): Promise<{ deleted: number; freedBytes: number }> {
  if (!config?.retention.enabled || !database) return { deleted: 0, freedBytes: 0 };
  const { maxAgeDays, maxBytes } = config.retention;
  if (maxAgeDays === 0 && maxBytes === 0) {
    retentionStatus = { lastRunAt: new Date().toISOString(), deleted: 0, freedBytes: 0, failures: 0, noCandidates: true };
    return { deleted: 0, freedBytes: 0 };
  }
  const recordingsRoot = resolve(config.recordingsDir || resolve(userDataPath, "recordings"));
  const snapshotsRoot = resolve(config.snapshotDir || resolve(userDataPath, "snapshots"));
  type Candidate = { kind: "snapshot" | "recording"; id: string; timestamp: number; bytes: number; paths: string[] };
  const candidates: Candidate[] = [];
  const snapshots = await database.request("snapshot.list", {});
  if (snapshots.ok) for (const snapshot of snapshots.value as SnapshotRecord[]) {
    const metadata = await database.request("media.metadata.get", { kind: "snapshot", mediaId: snapshot.id });
    if (metadata.ok && (metadata.value as MediaMetadata | null)?.protected) continue;
    try {
      const path = await resolveLibraryFile(snapshotsRoot, snapshot.path, new Set([".jpg", ".jpeg", ".png"]));
      candidates.push({ kind: "snapshot", id: snapshot.id, timestamp: Date.parse(snapshot.capturedAt), bytes: (await stat(path)).size, paths: [path] });
    } catch { /* unavailable media is never removed by retention */ }
  }
  const recordings = await database.request("recording.library", {});
  if (recordings.ok) for (const recording of recordings.value as RecordingRecord[]) {
    if (activeRecordings.has(recording.cameraId) || getClipExporter().isUsingRecording(recording.id) || ["starting", "recording", "stopping"].includes(recording.status)) continue;
    const metadata = await database.request("media.metadata.get", { kind: "recording", mediaId: recording.id });
    if (metadata.ok && (metadata.value as MediaMetadata | null)?.protected) continue;
    const segments = await database.request("recording.segment.list", { recordingId: recording.id });
    if (!segments.ok) continue;
    try {
      const paths = await Promise.all((segments.value as RecordingSegmentRecord[]).map((segment) => resolveLibraryFile(recordingsRoot, segment.path, new Set([".mp4", ".m4s"]))));
      const sizes = await Promise.all(paths.map(async (path) => (await stat(path)).size));
      candidates.push({ kind: "recording", id: recording.id, timestamp: Date.parse(recording.endedAt ?? recording.startedAt), bytes: sizes.reduce((a, b) => a + b, 0), paths });
    } catch { /* preserve catalogue when a segment cannot be verified */ }
  }
  const selectedIds = new Set(selectRetentionCandidates(
    candidates.map((candidate) => ({ ...candidate, protected: false, active: false })),
    { now: Date.now(), maxAgeDays, maxBytes },
  ));
  let deleted = 0;
  let freedBytes = 0;
  let failures = 0;
  for (const candidate of candidates) {
    if (!selectedIds.has(candidate.id)) continue;
    const staged: Array<{ original: string; temporary: string }> = [];
    let catalogueDeleted = false;
    try {
      for (const path of candidate.paths) {
        const temporary = `${path}.retention-${randomUUID()}.pending`;
        await rename(path, temporary);
        staged.push({ original: path, temporary });
      }
      const response = await database.request(candidate.kind === "snapshot" ? "snapshot.delete" : "recording.delete", { id: candidate.id });
      if (!response.ok || response.value !== true) throw new Error("catalogue delete failed");
      catalogueDeleted = true;
      await Promise.all(staged.map(({ temporary }) => unlink(temporary).catch(() => undefined)));
      freedBytes += candidate.bytes;
      deleted += 1;
    } catch {
      failures += 1;
      // Restore every staged file when the catalogue was not changed.
      if (catalogueDeleted) continue;
      await Promise.all(staged.map(async ({ original, temporary }) => {
        try { await rename(temporary, original); } catch { /* best effort recovery */ }
      }));
    }
  }
  retentionStatus = { lastRunAt: new Date().toISOString(), deleted, freedBytes, failures, noCandidates: candidates.length === 0 };
  return { deleted, freedBytes };
}

async function stopActiveRecording(
  cameraId: string,
  status: "completed" | "interrupted" = "completed",
): Promise<{ stopped: boolean; saved: boolean }> {
  const active = activeRecordings.get(cameraId);
  if (!active || !database) return { stopped: false, saved: false };
  const disabled = mediaSupervisor
    ? await mediaSupervisor.setRecording(
        mediaSessionId(cameraId, "main"),
        false,
      )
    : false;
  const segmentCount = disabled ? await catalogRecordingFiles(active) : 0;
  const saved = segmentCount > 0;
  await database.request("recording.complete", {
    id: active.recordingId,
    status: disabled && saved ? status : "interrupted",
  });
  await database.request("camera.setRecordingStatus", {
    cameraId,
    status: "idle",
  });
  if (status === "interrupted" || !disabled || !saved) {
    localAlerts.report("recording_interrupted", "Gravação interrompida antes de ser finalizada.", cameraId);
  }
  activeRecordings.delete(cameraId);
  recordingSources.delete(cameraId);
  const mainSessionId = mediaSessionId(cameraId, "main");
  if (!activeViewSessions.has(mainSessionId))
    await mediaSupervisor?.release(mainSessionId);
  return { stopped: true, saved };
}

async function catalogRecordingFiles(active: {
  recordingId: string;
  startedAt: string;
  recordDir: string;
}, segmentStatus: "completed" | "interrupted" = "completed"): Promise<number> {
  if (!database) return 0;
  const databaseConnection = database;
  const listFiles = async (): Promise<string[]> => {
    const files: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }
      await Promise.all(
        entries.map(async (entry) => {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await visit(path);
          else if (/\.(?:mp4|m4s)$/i.test(entry.name)) files.push(path);
        }),
      );
    };
    await visit(active.recordDir);
    return files;
  };

  const deadline = Date.now() + 3_000;
  let files: string[] = [];
  do {
    files = await listFiles();
    if (files.length > 0 || Date.now() >= deadline) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  } while (Date.now() < deadline);

  const startedAfter = Date.parse(active.startedAt) - 5_000;
  let cataloged = 0;
  for (const path of files) {
    let info;
    try {
      info = await stat(path);
    } catch {
      continue;
    }
    if (info.mtimeMs < startedAfter) continue;
    const result = await databaseConnection.request(
      "recording.segment.create",
      {
        recordingId: active.recordingId,
        path,
        startedAt: info.birthtime.toISOString(),
        endedAt: info.mtime.toISOString(),
        durationMs: Math.max(0, info.mtimeMs - info.birthtimeMs),
        status: segmentStatus,
      },
    );
    if (result.ok) cataloged += 1;
  }
  return cataloged;
}

async function startRecording(
  cameraId: string,
  source: "manual" | "scheduled",
): Promise<Record<string, unknown>> {
  return withRecordingLock(cameraId, async () => {
    if (!config || !database || !mediaSupervisor) return { ok: false };
    const existing = activeRecordings.get(cameraId);
    if (existing) {
      if (source === "manual") recordingSources.set(cameraId, "manual");
      return {
        ok: true, writeAllowed: true, cameraId, recordingId: existing.recordingId,
        startedAt: existing.startedAt, status: "recording",
      };
    }
    const camera = await getCameraRecord(cameraId);
    if (!camera) throw new Error("Câmera não encontrada.");
    if (!camera.active) throw new Error("A câmera está desativada.");
    const rtspUrl = await cameraRtspUrl(camera);
    if (!rtspUrl) throw new Error("A câmera não possui um endpoint RTSP configurado.");
    const libraryRoot = config.recordingsDir || resolve(userDataPath, "recordings");
    await mkdir(libraryRoot, { recursive: true });
    const { checkStorageStatus, shouldAllowWrite } = await import("./services/storage-monitor.js");
    const storage = await checkStorageStatus(libraryRoot);
    if (!shouldAllowWrite(storage)) {
      localAlerts.report(storage.lowSpace ? "storage_low" : "storage_unavailable", storage.lowSpace ? "Espaço em disco insuficiente para gravar." : "Diretório de gravação indisponível.", cameraId);
      return { ok: false, writeAllowed: false, cameraId, status: "failed" };
    }
    const mainSessionId = mediaSessionId(cameraId, "main");
    const recordPath = resolve(libraryRoot, "%path", "%Y-%m-%d", "%H-%M-%S-%f");
    const currentMediaStatus = mediaSupervisor.status(mainSessionId);
    const mediaStatus = currentMediaStatus?.state === "running" ? currentMediaStatus : await mediaSupervisor.acquire(mainSessionId, rtspUrl, `${mediaPath(cameraId)}_main`, recordPath, false);
    if (mediaStatus.state !== "running") throw new Error(mediaStatus.error || "Gateway de mídia indisponível.");
    const response = await database.request("recording.create", { cameraId });
    if (!response.ok) throw new Error("Não foi possível criar o catálogo da gravação.");
    const recording = response.value as { id: string; startedAt: string };
    const enabled = await mediaSupervisor.setRecording(mainSessionId, true);
    if (!enabled) {
      await database.request("recording.complete", { id: recording.id, status: "failed" });
      if (!activeViewSessions.has(mainSessionId)) await mediaSupervisor.release(mainSessionId);
      throw new Error("O gateway recusou o início da gravação.");
    }
    activeRecordings.set(cameraId, { recordingId: recording.id, startedAt: recording.startedAt, recordDir: resolve(libraryRoot, `${mediaPath(cameraId)}_main`) });
    recordingSources.set(cameraId, source);
    await database.request("camera.setRecordingStatus", { cameraId, status: "recording" });
    await emitCameraChanged();
    return { ok: true, writeAllowed: true, recordingId: recording.id, cameraId, status: "recording", startedAt: recording.startedAt };
  });
}

async function reconcileScheduledRecordings(): Promise<void> {
  if (!database) return;
  const cameras = await database.request("camera.listAll", undefined);
  if (!cameras.ok) return;
  const now = new Date();
  for (const camera of cameras.value as CameraRecord[]) {
    const scheduled = await database.request("schedule.list", { cameraId: camera.id });
    if (!scheduled.ok) continue;
    const suppressed = (scheduleSuppressedUntil.get(camera.id) ?? 0) > now.getTime();
    if (suppressed && !isScheduledAt(scheduled.value as SchedulePeriod[], now)) {
      scheduleSuppressedUntil.delete(camera.id);
    }
    const action = shouldScheduleRecording({
      periods: scheduled.value as SchedulePeriod[], now, cameraActive: camera.active,
      manualRecording: recordingSources.get(camera.id) === "manual", scheduledRecording: recordingSources.get(camera.id) === "scheduled",
    });
    if (action === "start" && !suppressed) {
      try { await startRecording(camera.id, "scheduled"); } catch { localAlerts.report("recording_interrupted", "A gravação agendada não pôde ser iniciada.", camera.id); }
    } else if (action === "stop") {
      await withRecordingLock(camera.id, () => stopActiveRecording(camera.id));
      await emitCameraChanged();
    }
  }
}

app.setName("simple-dvr-wifi");
app.enableSandbox();
if (process.env.SWC_TEST_USER_DATA) {
  app.setPath("userData", resolve(process.env.SWC_TEST_USER_DATA));
}
const hardwareAccelerationEnabled = loadHardwareAcceleration(
  app.getPath("userData"),
);
if (!hardwareAccelerationEnabled) app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const rendererRoot = resolve(__dirname, "../renderer");
const projectRoot = resolve(__dirname, "../..");

function registerApplicationProtocol(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const snapshotMatch = url.pathname.match(
      /^\/media\/snapshots\/([0-9a-f-]+)$/i,
    );
    if (
      url.hostname === "renderer" &&
      snapshotMatch &&
      !url.search &&
      !url.hash
    ) {
      return snapshotResponse(request, snapshotMatch[1]!);
    }
    const recordingMatch = url.pathname.match(
      /^\/media\/recordings\/([0-9a-f-]+)(?:\/(\d{1,5}))?$/i,
    );
    if (
      url.hostname === "renderer" &&
      recordingMatch &&
      !url.search &&
      !url.hash
    ) {
      return recordingResponse(
        request,
        recordingMatch[1]!,
        Number(recordingMatch[2] ?? 0),
      );
    }

    const assetPath = resolveRenderAsset(rendererRoot, request.url);
    if (!assetPath) {
      return new Response("Not found", { status: 404 });
    }
    const response = await net.fetch(pathToFileURL(assetPath).toString());
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", CSP_DIRECTIVES);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  });
}

async function snapshotResponse(
  request: GlobalRequest,
  id: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }
  if (!z.string().uuid().safeParse(id).success || !database || !config) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await database.request("snapshot.get", { id });
    const snapshot = result.ok ? (result.value as SnapshotRecord | null) : null;
    if (!snapshot) return new Response("Not found", { status: 404 });

    const root = resolve(
      config.snapshotDir || resolve(userDataPath, "snapshots"),
    );
    const target = await resolveLibraryFile(
      root,
      snapshot.path,
      new Set([".jpg", ".jpeg", ".png"]),
    );
    const response = await net.fetch(pathToFileURL(target).toString());
    const headers = new Headers(response.headers);
    headers.set(
      "Content-Type",
      extname(target).toLowerCase() === ".png" ? "image/png" : "image/jpeg",
    );
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function recordingResponse(
  request: GlobalRequest,
  id: string,
  segmentIndex = 0,
): Promise<Response> {
  if (
    !z.string().uuid().safeParse(id).success ||
    !Number.isSafeInteger(segmentIndex) ||
    segmentIndex < 0 ||
    !database ||
    !config
  ) {
    return new Response("Not found", { status: 404 });
  }

  const result = await database.request("recording.get", { id });
  if (!result.ok || !result.value) {
    return new Response("Not found", { status: 404 });
  }
  const segmentsResponse = await database.request("recording.segment.list", {
    recordingId: id,
  });
  const segment = segmentsResponse.ok
    ? (segmentsResponse.value as RecordingSegmentRecord[])[segmentIndex]
    : undefined;
  if (!segment) return new Response("Not found", { status: 404 });

  try {
    const root = resolve(
      config.recordingsDir || resolve(userDataPath, "recordings"),
    );
    const target = await resolveLibraryFile(
      root,
      segment.path,
      new Set([".mp4", ".m4s"]),
    );
    return await recordingFileResponse(request, target);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function configureSessionSecurity(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders ?? {};
    if (details.url.startsWith("app://renderer")) {
      responseHeaders["X-Content-Type-Options"] = ["nosniff"];
    }
    callback({ responseHeaders });
  });
}

function configureWindowSecurity(window: BrowserWindow): void {
  configureNavigationSecurity(window.webContents);
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function trayIconPath(): string {
  const extension = process.platform === "win32" ? "ico" : "png";
  return app.isPackaged
    ? resolve(process.resourcesPath, `tray-icon.${extension}`)
    : resolve(projectRoot, "build", `icon.${extension}`);
}

function createTray(): Tray {
  const icon = nativeImage.createFromPath(trayIconPath());
  if (icon.isEmpty()) throw new Error("Ícone da bandeja não encontrado.");
  const menuIcon = icon.resize({ width: 16, height: 16, quality: "best" });

  const applicationTray = new Tray(icon);
  applicationTray.setToolTip("Simple DVR Wi-Fi");
  applicationTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Abrir Simple DVR Wi-Fi",
        icon: menuIcon,
        click: showMainWindow,
      },
      { type: "separator" },
      { label: "Sair", role: "quit" },
    ]),
  );
  applicationTray.on("click", showMainWindow);
  return applicationTray;
}

function runSecuritySmokeIfRequested(window: BrowserWindow): void {
  if (process.env.ELECTRON_SECURITY_SMOKE !== "1") return;

  const remoteRequests = new Set<string>();
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        callback({});
        return;
      }
      const loopback =
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "[::1]";
      if (!loopback) {
        remoteRequests.add(details.url);
      }
    } catch {
      // ignore malformed request URLs
    }
    callback({});
  });

  window.webContents.once("did-finish-load", () => {
    const probe = `(async () => {
      const result = { hasRequire: typeof globalThis.require !== 'undefined', hasProcess: typeof globalThis.process !== 'undefined', hasIpcRenderer: typeof globalThis.ipcRenderer !== 'undefined', preloadApiLoaded: typeof globalThis.api?.cameras?.list === 'function' }

      globalThis.__cspInlineSentinel = 'blocked'
      const inline = document.createElement('script')
      inline.textContent = 'globalThis.__cspInlineSentinel = "executed"'
      document.head.appendChild(inline)

      const remoteImage = document.createElement('img')
      remoteImage.src = 'https://csp.example.invalid/probe.png'

      const remoteScript = document.createElement('script')
      remoteScript.src = 'https://csp.example.invalid/probe.js'
      document.head.appendChild(remoteScript)

      try {
        await fetch('https://csp.example.invalid/probe.json')
      } catch {
        // expected to be blocked by CSP
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
      result.inlineScriptBlocked = globalThis.__cspInlineSentinel === 'blocked'
      return JSON.stringify(result)
    })()`;

    void window.webContents
      .executeJavaScript(probe)
      .then(async (result) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const probeResult = JSON.parse(result as string);
        probeResult.hardwareAccelerationRequested = hardwareAccelerationEnabled;
        probeResult.gpuFeatureStatus = app.getGPUFeatureStatus();
        probeResult.remoteResourceBlocked = remoteRequests.size === 0;
        if (database) {
          const health = await database.healthCheck(3_000);
          probeResult.databaseWorkerOk = health;
        }
        window.close();
        probeResult.closeToTrayOk =
          Boolean(tray) && !window.isDestroyed() && !window.isVisible();
        console.log(`__SECURITY_SMOKE__${JSON.stringify(probeResult)}`);
        await performShutdown();
        app.exit(0);
      })
      .catch((error: unknown) => {
        console.error("__SECURITY_SMOKE_FAILED__", error);
        app.exit(1);
      });
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#101418",
    icon: is.dev ? resolve(app.getAppPath(), "build", "icon.png") : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  configureWindowSecurity(window);
  runSecuritySmokeIfRequested(window);
  window.on("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    window.hide();
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadURL("app://renderer/index.html");
  }

  return window;
}

const OpenExternalRequestSchema = z.object({
  url: z.string().min(1).max(2048),
});

const SaveConfigRequestSchema = z.object({
  config: z.unknown(),
});

const CameraCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65_535).nullable().optional(),
  manufacturer: z.string().max(120).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  serialNumber: z.string().max(120).nullable().optional(),
  epr: z.string().max(2048).nullable().optional(),
  rtspUrl: z.string().max(2048).nullable().optional(),
  onvifUrl: z.string().max(2048).nullable().optional(),
  snapshotUri: z.string().max(2048).nullable().optional(),
  username: z.string().max(253).nullable().optional(),
  password: z.string().max(2048).nullable().optional(),
  allowDuplicate: z.boolean().optional(),
});

const CameraIdRequestSchema = z.object({
  id: z.string().uuid(),
});

const CameraUpdateCredentialsSchema = z.object({
  id: z.string().uuid(),
  username: z.string().trim().max(256).nullable().optional(),
  password: z.string().max(2048).nullable().optional(),
  rtspPassword: z.string().max(2048).nullable().optional(),
});

const CameraUpdateRequestSchema = CameraCreateRequestSchema.pick({
  name: true,
  host: true,
  port: true,
  rtspUrl: true,
  onvifUrl: true,
  username: true,
  password: true,
}).extend({
  id: z.string().uuid(),
});

const CameraConnectionTestSchema = z.object({
  host: z.string().trim().max(253).optional(),
  port: z.number().int().min(1).max(65_535).nullable().optional(),
  rtspUrl: z.string().max(2048).nullable().optional(),
  onvifUrl: z.string().max(2048).nullable().optional(),
  username: z.string().max(253).nullable().optional(),
  password: z.string().max(2048).nullable().optional(),
});
const LibraryRequestSchema = z
  .object({
    cameraId: z.string().uuid().optional(),
    startAt: z.string().datetime({ offset: true }).optional(),
    endAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    ({ startAt, endAt }) =>
      !startAt || !endAt || Date.parse(startAt) < Date.parse(endAt),
    { message: "O período selecionado é inválido." },
  );

function registerIpcHandlers(): void {
  const registry = new IpcRegistry(ipcMain, () => mainWindow?.webContents);

  registry.register("cameras:list", {
    input: EmptyRequestSchema,
    handle: listCameraSummaries,
  });

  registry.register("cameras:details", {
    input: CameraIdRequestSchema,
    handle: ({ id }) => cameraEditDetails(id),
  });

  registry.register("cameras:create", {
    input: CameraCreateRequestSchema,
    handle: async (input) => {
      if (!cameraManagement)
        return { ok: false, error: "Serviço indisponível." };
      const result = await cameraManagement.create(input);
      const hasCredential = credentials
        ? await credentials.hasCredential(result.camera.id)
        : false;
      const response = {
        ok: true,
        camera: mapCameraRecord(result.camera, hasCredential),
        duplicate: result.duplicate,
      };
      await emitCameraChanged();
      return response;
    },
  });

  registry.register("cameras:checkDuplicate", {
    input: z.object({
      host: z.string().optional(),
      serialNumber: z.string().optional(),
      epr: z.string().optional(),
    }),
    handle: async (input) => {
      if (!cameraManagement) return { ok: false };
      const result = await cameraManagement.checkDuplicates(input);
      return { ok: true, ...result };
    },
  });

  registry.register("cameras:update", {
    input: CameraUpdateRequestSchema,
    handle: async ({ id, ...input }) => {
      if (!cameraManagement) throw new Error("Serviço indisponível.");
      const updated = await cameraManagement.update(id, input);
      if (!updated) throw new Error("Câmera não encontrada.");
      await emitCameraChanged();
      return { updated: true };
    },
  });

  registry.register("cameras:testConnection", {
    input: CameraConnectionTestSchema,
    handle: async ({ rtspUrl, onvifUrl, username, password }) => {
      const parsedRtsp = rtspUrl ? parseRtspUrl(rtspUrl) : null;
      if (rtspUrl && !parsedRtsp) throw new Error("URL RTSP inválida.");
      const parsedOnvif = onvifUrl ? parseHttpUrl(onvifUrl) : null;
      if (onvifUrl && !parsedOnvif) throw new Error("URL ONVIF inválida.");
      if (!parsedRtsp && !parsedOnvif) {
        throw new Error("Informe uma URL ONVIF ou RTSP para testar.");
      }

      const segments: Array<{
        name: "onvif" | "rtsp";
        status: "ok" | "error" | "skipped";
        detail: string;
      }> = [];
      const connection = {
        username:
          username?.trim() ||
          parsedRtsp?.username ||
          parsedOnvif?.username ||
          null,
        password:
          password || parsedRtsp?.password || parsedOnvif?.password || null,
      };

      if (parsedOnvif) {
        try {
          const { OnvifAdapter, createFetchOnvifTransport } =
            await import("../workers/camera/onvif-adapter.js");
          const info = await new OnvifAdapter({
            deviceServiceUrl: parsedOnvif.sanitizedUrl,
            username: connection.username,
            password: connection.password,
            transport: createFetchOnvifTransport(),
          }).detect();
          const available = info.capabilities.onvif !== "error";
          segments.push({
            name: "onvif",
            status: available ? "ok" : "error",
            detail: available ? "ONVIF acessível." : "ONVIF não respondeu.",
          });
        } catch {
          segments.push({
            name: "onvif",
            status: "error",
            detail: "Falha ao consultar o endpoint ONVIF.",
          });
        }
      } else {
        segments.push({
          name: "onvif",
          status: "skipped",
          detail: "Endpoint não configurado.",
        });
      }

      if (parsedRtsp) {
        const { probeRtsp } = await import("../workers/camera/probes.js");
        const result = await probeRtsp({
          url: parsedRtsp.sanitizedUrl,
          username: connection.username,
          password: connection.password,
          timeoutMs: 5_000,
        });
        segments.push({
          name: "rtsp",
          status: result === "ok" ? "ok" : "error",
          detail:
            result === "ok"
              ? "Stream RTSP acessível."
              : result === "auth_error"
                ? "Credenciais RTSP rejeitadas."
                : "Stream RTSP inacessível.",
        });
      } else {
        segments.push({
          name: "rtsp",
          status: "skipped",
          detail: "Endpoint não configurado.",
        });
      }

      return {
        status: segments.some((segment) => segment.status === "ok")
          ? "connected"
          : "unavailable",
        segments,
      };
    },
  });

  registry.register("cameras:test", {
    input: CameraIdRequestSchema,
    handle: async ({ id }) => {
      if (!database) throw new Error("Banco indisponível.");
      const camera = await getCameraRecord(id);
      if (!camera) throw new Error("Câmera não encontrada.");
      const segments: Array<{
        name: "onvif" | "rtsp";
        status: "ok" | "error" | "skipped";
        detail: string;
      }> = [];
      const onvifEndpoint = camera.endpoints.find(
        (item) => item.service === "onvif",
      )?.url;
      let discoveredRtsp = camera.endpoints.find(
        (item) => item.service === "rtsp",
      )?.url;
      let onvifAvailable = false;

      if (onvifEndpoint) {
        try {
          const { OnvifAdapter, createFetchOnvifTransport } =
            await import("../workers/camera/onvif-adapter.js");
          const credential = await cameraCredential(id, "onvif");
          const info = await new OnvifAdapter({
            deviceServiceUrl: onvifEndpoint,
            username: credential?.username,
            password: credential?.password,
            transport: createFetchOnvifTransport(),
          }).detect();
          onvifAvailable = info.capabilities.onvif !== "error";
          await database.request("camera.setIdentity", {
            cameraId: id,
            manufacturer: info.identity.manufacturer || undefined,
            model: info.identity.model || undefined,
            serialNumber: info.identity.serialNumber || undefined,
          });
          await database.request("camera.setCapabilities", {
            cameraId: id,
            onvif: onvifAvailable,
            rtsp: info.capabilities.rtsp === "supported",
            snapshot: info.capabilities.snapshot === "supported",
            ptz: info.ptzSupported,
            h264: info.capabilities.h264 === "supported",
            h265: info.capabilities.h265 === "supported",
            mjpeg: info.capabilities.mjpeg === "supported",
          });
          if (info.profiles.length > 0) {
            await database.request("profile.replaceAll", {
              cameraId: id,
              profiles: info.profiles.map((profile) => ({
                token: profile.token,
                name: profile.name || null,
                streamType: profile.streamType,
                codec: profile.codec,
                width: profile.width,
                height: profile.height,
                fps: profile.fps,
              })),
            });
          }
          if (info.rtspMainUrl) {
            const parsedRtsp = parseRtspUrl(info.rtspMainUrl);
            if (parsedRtsp) {
              discoveredRtsp = parsedRtsp.sanitizedUrl;
              await database.request("camera.setEndpoint", {
                cameraId: id,
                service: "rtsp",
                url: discoveredRtsp,
              });
              if (parsedRtsp.password && credentials) {
                await credentials.setCredential(id, {
                  service: "rtsp",
                  username: parsedRtsp.username,
                  password: parsedRtsp.password,
                });
              }
            }
          }
          if (info.rtspSubUrl) {
            const parsedSubRtsp = parseRtspUrl(info.rtspSubUrl);
            if (parsedSubRtsp) {
              await database.request("camera.setEndpoint", {
                cameraId: id,
                service: "rtsp_sub",
                url: parsedSubRtsp.sanitizedUrl,
              });
            }
          }
          if (info.snapshotUri) {
            const parsedSnapshot = parseHttpUrl(info.snapshotUri);
            if (parsedSnapshot) {
              await database.request("camera.setEndpoint", {
                cameraId: id,
                service: "snapshot",
                url: parsedSnapshot.sanitizedUrl,
              });
              if (parsedSnapshot.password && credentials) {
                await credentials.setCredential(id, {
                  service: "snapshot",
                  username: parsedSnapshot.username,
                  password: parsedSnapshot.password,
                });
              }
            }
          }
          segments.push({
            name: "onvif",
            status: onvifAvailable ? "ok" : "error",
            detail: onvifAvailable
              ? `${info.profiles.length} perfil(is) detectado(s).`
              : "O dispositivo não respondeu às operações ONVIF.",
          });
        } catch {
          segments.push({
            name: "onvif",
            status: "error",
            detail: "Falha ao consultar o endpoint ONVIF.",
          });
        }
      } else {
        segments.push({
          name: "onvif",
          status: "skipped",
          detail: "Endpoint não configurado.",
        });
      }

      let finalStatus: CameraRecord["status"] = onvifAvailable
        ? "connected"
        : "unavailable";
      if (discoveredRtsp) {
        const { probeRtsp } = await import("../workers/camera/probes.js");
        const credential = await cameraCredential(id, "rtsp");
        const result = await probeRtsp({
          url: discoveredRtsp,
          username: credential?.username,
          password: credential?.password,
          timeoutMs: 5_000,
        });
        finalStatus =
          result === "ok"
            ? "connected"
            : result === "auth_error"
              ? "auth_error"
              : "network_error";
        segments.push({
          name: "rtsp",
          status: result === "ok" ? "ok" : "error",
          detail:
            result === "ok"
              ? "Stream RTSP acessível."
              : result === "auth_error"
                ? "Credenciais RTSP rejeitadas."
                : "Stream RTSP inacessível.",
        });
      } else {
        segments.push({
          name: "rtsp",
          status: "skipped",
          detail: "Endpoint não configurado.",
        });
      }
      await database.request("camera.setStatus", {
        cameraId: id,
        status: finalStatus,
      });
      if (finalStatus === "network_error" || finalStatus === "unavailable" || finalStatus === "auth_error") {
        localAlerts.report("camera_disconnected", "Câmera desconectada ou inacessível.", id);
      }
      await emitCameraChanged();
      return { status: finalStatus, segments };
    },
  });

  registry.register("cameras:deactivate", {
    input: CameraIdRequestSchema,
    handle: async ({ id }) => {
      await withRecordingLock(id, () => stopActiveRecording(id, "interrupted"));
      activeViewSessions.delete(mediaSessionId(id, "main"));
      activeViewSessions.delete(mediaSessionId(id, "sub"));
      await releaseCameraMedia(id);
      const changed = cameraManagement
        ? await cameraManagement.deactivate(id)
        : false;
      await emitCameraChanged();
      return changed;
    },
  });

  registry.register("cameras:reactivate", {
    input: CameraIdRequestSchema,
    handle: async ({ id }) => {
      const changed = cameraManagement
        ? await cameraManagement.reactivate(id)
        : false;
      await emitCameraChanged();
      return changed;
    },
  });

  registry.register("cameras:updateCredentials", {
    input: CameraUpdateCredentialsSchema,
    handle: async ({ id, username, password, rtspPassword }) => {
      if (!cameraManagement) return false;
      await cameraManagement.updateCredentials(id, {
        username: username ?? null,
        password: password ?? null,
        rtspPassword: rtspPassword ?? null,
      });
      await emitCameraChanged();
      return true;
    },
  });

  registry.register("cameras:remove", {
    input: CameraIdRequestSchema,
    handle: async ({ id }) => {
      if (!cameraManagement) return { removed: false };
      await withRecordingLock(id, () => stopActiveRecording(id, "interrupted"));
      activeViewSessions.delete(mediaSessionId(id, "main"));
      activeViewSessions.delete(mediaSessionId(id, "sub"));
      await releaseCameraMedia(id);
      await ptzRegistry?.release(id);
      const result = await cameraManagement.remove(id);
      await emitCameraChanged();
      return result;
    },
  });

  registry.register("media:acquire", {
    input: z.object({
      cameraId: z.string().uuid(),
      profile: z.enum(["main", "sub"]),
    }),
    handle: async ({ cameraId, profile }) => {
      if (!mediaSupervisor) return null;
      const camera = await getCameraRecord(cameraId);
      if (!camera) throw new Error("Câmera não encontrada.");
      if (!camera.active) {
        throw new Error("A câmera está desativada.");
      }
      const rtspUrl = await cameraRtspUrl(camera, profile);
      if (!rtspUrl)
        throw new Error("A câmera não possui um endpoint RTSP configurado.");
      const sessionId = mediaSessionId(cameraId, profile);
      const libraryRoot =
        config?.recordingsDir || resolve(userDataPath, "recordings");
      const recordPath = resolve(
        libraryRoot,
        "%path",
        "%Y-%m-%d",
        "%H-%M-%S-%f",
      );
      const status = await mediaSupervisor.acquire(
        sessionId,
        rtspUrl,
        `${mediaPath(cameraId)}_${profile}`,
        recordPath,
        profile !== "main",
      );
      if (status.state === "running") activeViewSessions.add(sessionId);
      if (database) {
        await database.request("camera.setStatus", {
          cameraId,
          status: status.state === "running" ? "connected" : "media_error",
        });
        if (status.state !== "running") {
          localAlerts.report("camera_disconnected", "Câmera desconectada durante a transmissão.", cameraId);
        }
      }
      await emitCameraChanged();
      return status;
    },
  });

  registry.register("media:release", {
    input: z.object({
      cameraId: z.string().uuid(),
      profile: z.enum(["main", "sub"]),
    }),
    handle: async ({ cameraId, profile }) => {
      if (!mediaSupervisor) return { released: false };
      const sessionId = mediaSessionId(cameraId, profile);
      activeViewSessions.delete(sessionId);
      if (profile === "main" && activeRecordings.has(cameraId))
        return { released: false };
      await mediaSupervisor.release(sessionId);
      return { released: true };
    },
  });

  registry.register("media:status", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) =>
      mediaSupervisor
        ? mediaSupervisor.status(mediaSessionId(cameraId, "main"))
        : null,
  });

  registry.register("media:whepEndpoint", {
    input: z.object({
      cameraId: z.string().uuid(),
      profile: z.enum(["main", "sub"]),
    }),
    handle: async ({ cameraId, profile }) =>
      mediaSupervisor
        ? mediaSupervisor.whepEndpoint(
            mediaSessionId(cameraId, profile),
            profile,
          )
        : null,
  });

  registry.register("ptz:move", {
    input: z.object({
      cameraId: z.string().uuid(),
      velocity: z.object({
        pan: z.number().optional(),
        tilt: z.number().optional(),
        zoom: z.number().optional(),
      }),
    }),
    handle: async ({ cameraId, velocity }) => {
      console.log("[ptz:move]", cameraId, JSON.stringify(velocity));
      if (!ptzRegistry) return { started: false };
      const camera = await getCameraRecord(cameraId);
      if (!camera || !camera.active || !camera.supportsPtz) {
        console.log(
          "[ptz:move] rejeitado:",
          camera
            ? `active=${camera.active} ptz=${camera.supportsPtz}`
            : "sem câmera",
        );
        return { started: false };
      }
      const result = await ptzRegistry.move(
        cameraId,
        velocity,
        camera.supportsPtz,
      );
      console.log("[ptz:move] resultado:", JSON.stringify(result));
      return result;
    },
  });

  registry.register("ptz:connect", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) => {
      if (!ptzRegistry) return { connected: false };
      const camera = await getCameraRecord(cameraId);
      if (!camera || !camera.active || !camera.supportsPtz) {
        return { connected: false };
      }
      return ptzRegistry.connect(cameraId, camera.supportsPtz);
    },
  });

  registry.register("ptz:stop", {
    input: z.object({
      cameraId: z.string().uuid(),
      trigger: z.enum([
        "pointer_release",
        "key_release",
        "blur",
        "unmount",
        "camera_switch",
        "failure",
        "shutdown",
      ]),
    }),
    handle: async ({ cameraId, trigger }) => {
      if (!ptzRegistry) return;
      await ptzRegistry.stop(cameraId, trigger);
    },
  });

  registry.register("ptz:status", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) =>
      ptzRegistry ? ptzRegistry.state(cameraId) : null,
  });

  const ptzCamera = async (cameraId: string): Promise<CameraRecord> => {
    const camera = await getCameraRecord(cameraId);
    if (!camera || !camera.active || !camera.supportsPtz) throw new Error("PTZ indisponível para esta câmera.");
    return camera;
  };
  registry.register("ptz:presets:list", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) => {
      const camera = await ptzCamera(cameraId);
      return ptzRegistry?.listPresets(cameraId, camera.supportsPtz) ?? [];
    },
  });
  registry.register("ptz:presets:goto", {
    input: z.object({ cameraId: z.string().uuid(), presetToken: z.string().min(1).max(512) }),
    handle: async ({ cameraId, presetToken }) => {
      const camera = await ptzCamera(cameraId);
      await ptzRegistry?.gotoPreset(cameraId, presetToken, camera.supportsPtz);
      return { moved: true };
    },
  });
  registry.register("ptz:presets:set", {
    input: z.object({ cameraId: z.string().uuid(), name: z.string().trim().min(1).max(120), presetToken: z.string().min(1).max(512).optional() }),
    handle: async ({ cameraId, name, presetToken }) => {
      const camera = await ptzCamera(cameraId);
      const token = await ptzRegistry?.setPreset(cameraId, name, presetToken, camera.supportsPtz);
      return { token: token ?? null };
    },
  });
  registry.register("ptz:presets:remove", {
    input: z.object({ cameraId: z.string().uuid(), presetToken: z.string().min(1).max(512) }),
    handle: async ({ cameraId, presetToken }) => {
      const camera = await ptzCamera(cameraId);
      await ptzRegistry?.removePreset(cameraId, presetToken, camera.supportsPtz);
      return { removed: true };
    },
  });

  registry.register("snapshots:capture", {
    input: z.object({
      cameraId: z.string().uuid(),
    }),
    handle: async ({ cameraId }) => {
      if (!config || !database) return { ok: false };
      const camera = await getCameraRecord(cameraId);
      if (!camera) throw new Error("Câmera não encontrada.");
      if (!camera.active) {
        throw new Error("A câmera está desativada.");
      }
      const storedSnapshot = camera.endpoints.find(
        (item) => item.service === "snapshot",
      )?.url;
      const storedRtsp = await cameraRtspUrl(camera);
      const snapshotCredential = await cameraCredential(cameraId, "snapshot");
      const { captureSnapshot } =
        await import("./services/snapshot-capture.js");
      const result = await captureSnapshot({
        cameraId,
        libraryRoot: config.snapshotDir || resolve(userDataPath, "snapshots"),
        snapshotUri: storedSnapshot ?? null,
        rtspUrl: storedRtsp,
        username: snapshotCredential?.username,
        password: snapshotCredential?.password,
      });
      await database.request("snapshot.create", {
        cameraId,
        path: result.path,
      });
      return { ok: true, ...result };
    },
  });

  registry.register("snapshots:saveFrame", {
    input: z.object({
      cameraId: z.string().uuid(),
      data: z.instanceof(Uint8Array),
    }),
    maxPayloadBytes: 32 * 1024 * 1024,
    handle: async ({ cameraId, data }) => {
      if (!config || !database)
        throw new Error("Serviço de snapshots indisponível.");
      const camera = await getCameraRecord(cameraId);
      if (!camera?.active)
        throw new Error("Câmera não encontrada ou desativada.");

      const { saveSnapshot, validateSnapshotBuffer } =
        await import("./services/snapshot.js");
      const buffer = Buffer.from(data);
      validateSnapshotBuffer(buffer);
      const result = await saveSnapshot(buffer, {
        cameraId,
        libraryRoot: config.snapshotDir || resolve(userDataPath, "snapshots"),
      });
      const snapshotResponse = await database.request("snapshot.create", {
        cameraId,
        path: result.path,
      });
      if (!snapshotResponse.ok)
        throw new Error("Não foi possível registrar o frame capturado.");
      return {
        ok: true,
        ...result,
        snapshotId: (snapshotResponse.value as SnapshotRecord).id,
        source: "video" as const,
      };
    },
  });

  registry.register("recordings:start", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) => startRecording(cameraId, "manual"),
  });

  registry.register("recordings:stop", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) =>
      withRecordingLock(cameraId, async () => {
        if (!database || !mediaSupervisor) return { stopped: false };
        if (recordingSources.get(cameraId) === "scheduled") {
          // A parada explícita vence a agenda até que a janela atual termine.
          scheduleSuppressedUntil.set(cameraId, Date.now() + 24 * 60 * 60 * 1_000);
        }
        const stopped = await stopActiveRecording(cameraId);
        if (!stopped.stopped) return stopped;
        await emitCameraChanged();
        return stopped;
      }),
  });

  registry.register("recordings:savePreview", {
    input: z.object({
      cameraId: z.string().uuid(),
      recordingId: z.string().uuid(),
      data: z.instanceof(Uint8Array),
    }),
    maxPayloadBytes: 32 * 1024 * 1024,
    handle: async ({ cameraId, recordingId, data }) => {
      if (!database) throw new Error("Banco de dados indisponível.");
      const active = activeRecordings.get(cameraId);
      if (!active || active.recordingId !== recordingId) {
        throw new Error("A gravação não está ativa.");
      }
      const response = await database.request("recording.get", {
        id: recordingId,
      });
      const recording = response.ok
        ? (response.value as RecordingRecord | null)
        : null;
      if (!recording || recording.cameraId !== cameraId) {
        throw new Error("Gravação não encontrada.");
      }

      const { saveRecordingPreview } =
        await import("./services/recording-preview.js");
      await saveRecordingPreview(
        resolve(userDataPath, "recording-previews"),
        recordingId,
        data,
      );
      return { saved: true };
    },
  });

  registry.register("library:snapshots", {
    input: LibraryRequestSchema,
    handle: async (filters) => {
      if (!database) return [];
      const result = await database.request("snapshot.list", filters);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
  });

  registry.register("library:recordings", {
    input: LibraryRequestSchema,
    handle: async (filters) => {
      if (!database) return [];
      const result = await database.request("recording.library", filters);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
  });

  registry.register("library:recordingSegments", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => {
      if (!database) return [];
      const result = await database.request("recording.segment.list", {
        recordingId: id,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.value as RecordingSegmentRecord[];
    },
  });

  registry.register("library:metadata", {
    input: MediaMetadataInputSchema.pick({ kind: true, mediaId: true }),
    handle: async ({ kind, mediaId }) => {
      if (!database) return null;
      const result = await database.request("media.metadata.get", {
        kind,
        mediaId,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.value as MediaMetadata | null;
    },
  });

  registry.register("library:updateMetadata", {
    input: MediaMetadataInputSchema,
    handle: async (input) => withLibraryMutationLock(async () => {
      if (!database) throw new Error("Biblioteca indisponível.");
      const result = await database.request("media.metadata.upsert", input);
      if (!result.ok) throw new Error(result.error.message);
      return result.value as MediaMetadata;
    }),
  });

  registry.register("library:recordingPreview", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => {
      if (!database) return { dataUrl: null };
      const response = await database.request("recording.get", { id });
      if (!response.ok || !response.value) return { dataUrl: null };

      const { readRecordingPreview } =
        await import("./services/recording-preview.js");
      const dataUrl = await readRecordingPreview(
        resolve(userDataPath, "recording-previews"),
        id,
      );
      return { dataUrl };
    },
  });

  registry.register("library:readRecording", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => {
      if (!config || !database) throw new Error("Biblioteca indisponível.");
      const response = await database.request("recording.get", { id });
      if (!response.ok || !response.value)
        throw new Error("Gravação não encontrada.");

      const segmentsResponse = await database.request(
        "recording.segment.list",
        {
          recordingId: id,
        },
      );
      const first = segmentsResponse.ok
        ? (segmentsResponse.value as RecordingSegmentRecord[])[0]
        : undefined;
      if (!first) throw new Error("Arquivo de vídeo não encontrado.");

      const root = resolve(
        config.recordingsDir || resolve(userDataPath, "recordings"),
      );
      const target = await resolveLibraryFile(
        root,
        first.path,
        new Set([".mp4", ".m4s"]),
      );
      return {
        data: new Uint8Array(await readFile(target)),
        mimeType:
          extname(target).toLowerCase() === ".mp4"
            ? "video/mp4"
            : "video/iso.segment",
      };
    },
  });

  registry.register("library:deleteSnapshot", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => withLibraryMutationLock(async () => {
      if (!config || !database) return { deleted: false };
      const response = await database.request("snapshot.get", { id });
      const snapshot = response.ok
        ? (response.value as SnapshotRecord | null)
        : null;
      if (!snapshot) throw new Error("Foto não encontrada.");

      const root = resolve(
        config.snapshotDir || resolve(userDataPath, "snapshots"),
      );
      await deleteLibraryFile(
        root,
        snapshot.path,
        new Set([".jpg", ".jpeg", ".png"]),
      );
      const deleted = await database.request("snapshot.delete", { id });
      if (!deleted.ok || deleted.value !== true)
        throw new Error("Não foi possível excluir a foto.");
      return { deleted: true };
    }),
  });

  registry.register("library:deleteRecording", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => withLibraryMutationLock(async () => {
      if (!config || !database) return { deleted: false };
      const response = await database.request("recording.get", { id });
      const recording = response.ok
        ? (response.value as RecordingRecord | null)
        : null;
      if (!recording) throw new Error("Gravação não encontrada.");
      if (
        activeRecordings.has(recording.cameraId) ||
        ["starting", "recording", "stopping"].includes(recording.status)
      ) {
        throw new Error("Finalize a gravação antes de excluí-la.");
      }

      const segmentsResponse = await database.request(
        "recording.segment.list",
        { recordingId: id },
      );
      if (!segmentsResponse.ok)
        throw new Error("Não foi possível consultar os arquivos da gravação.");
      const segments = segmentsResponse.value as RecordingSegmentRecord[];
      const root = resolve(
        config.recordingsDir || resolve(userDataPath, "recordings"),
      );
      const { deleteRecordingPreview } =
        await import("./services/recording-preview.js");
      await deleteRecordingPreview(
        resolve(userDataPath, "recording-previews"),
        id,
      );
      for (const segment of segments) {
        await deleteLibraryFile(root, segment.path, new Set([".mp4", ".m4s"]));
      }
      const deleted = await database.request("recording.delete", { id });
      if (!deleted.ok || deleted.value !== true)
        throw new Error("Não foi possível excluir a gravação.");
      return { deleted: true };
    }),
  });

  registry.register("library:openSnapshot", {
    input: z.object({ path: z.string().min(1).max(2048) }),
    handle: async ({ path }) => {
      if (!config) return { opened: false };
      const root = resolve(
        config.snapshotDir || resolve(userDataPath, "snapshots"),
      );
      const target = await resolveLibraryFile(
        root,
        path,
        new Set([".jpg", ".jpeg", ".png"]),
      );
      const error = await shell.openPath(target);
      return { opened: error.length === 0 };
    },
  });

  registry.register("library:openRecording", {
    input: z.object({ path: z.string().min(1).max(2048) }),
    handle: async ({ path }) => {
      if (!config) return { opened: false };
      const root = resolve(
        config.recordingsDir || resolve(userDataPath, "recordings"),
      );
      const target = await resolveLibraryFile(
        root,
        path,
        new Set([".mp4", ".m4s"]),
      );
      const error = await shell.openPath(target);
      return { opened: error.length === 0 };
    },
  });

  registry.register("library:revealSnapshot", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => {
      if (!config || !database) return { revealed: false };
      const result = await database.request("snapshot.get", { id });
      const snapshot = result.ok ? (result.value as SnapshotRecord | null) : null;
      if (!snapshot) throw new Error("Foto não encontrada.");
      const target = await resolveLibraryFile(
        resolve(config.snapshotDir || resolve(userDataPath, "snapshots")),
        snapshot.path,
        new Set([".jpg", ".jpeg", ".png"]),
      );
      shell.showItemInFolder(target);
      return { revealed: true };
    },
  });

  registry.register("library:exportSnapshot", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => {
      if (!config || !database) return { exported: false };
      const result = await database.request("snapshot.get", { id });
      const snapshot = result.ok ? (result.value as SnapshotRecord | null) : null;
      if (!snapshot) throw new Error("Foto não encontrada.");
      const target = await resolveLibraryFile(
        resolve(config.snapshotDir || resolve(userDataPath, "snapshots")),
        snapshot.path,
        new Set([".jpg", ".jpeg", ".png"]),
      );
      const dialogOptions: Electron.SaveDialogOptions = {
        defaultPath: basename(target),
        filters: [{ name: "Imagem", extensions: ["jpg", "jpeg", "png"] }],
        properties: ["showOverwriteConfirmation"],
      };
      const destination = mainWindow
        ? await dialog.showSaveDialog(mainWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);
      if (destination.canceled || !destination.filePath) return { exported: false };
      await assertNewExportDestination(destination.filePath);
      await copyFile(target, destination.filePath, fsConstants.COPYFILE_EXCL);
      return { exported: true };
    },
  });

  registry.register("library:revealRecording", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => {
      if (!config || !database) return { revealed: false };
      const result = await database.request("recording.segment.list", { recordingId: id });
      const segment = result.ok ? (result.value as RecordingSegmentRecord[])[0] : undefined;
      if (!segment) throw new Error("Arquivo de vídeo não encontrado.");
      const target = await resolveLibraryFile(
        resolve(config.recordingsDir || resolve(userDataPath, "recordings")),
        segment.path,
        new Set([".mp4", ".m4s"]),
      );
      shell.showItemInFolder(target);
      return { revealed: true };
    },
  });

  registry.register("library:exportRecording", {
    input: z.object({ id: z.string().uuid() }),
    handle: async ({ id }) => {
      if (!config || !database) return { exported: false, files: 0 };
      const result = await database.request("recording.segment.list", { recordingId: id });
      const segments = result.ok ? (result.value as RecordingSegmentRecord[]) : [];
      if (segments.length === 0) throw new Error("Arquivo de vídeo não encontrado.");
      const root = resolve(config.recordingsDir || resolve(userDataPath, "recordings"));
      const sources = await Promise.all(
        segments.map((segment) =>
          resolveLibraryFile(root, segment.path, new Set([".mp4", ".m4s"])),
        ),
      );
      const dialogOptions: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
      };
      const destination = mainWindow
        ? await dialog.showOpenDialog(mainWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      if (destination.canceled || !destination.filePaths[0])
        return { exported: false, files: 0 };
      const destinations = sources.map((source) =>
        join(destination.filePaths[0]!, basename(source)),
      );
      await Promise.all(destinations.map(assertNewExportDestination));
      await Promise.all(
        sources.map((source, index) =>
          copyFile(source, destinations[index]!, fsConstants.COPYFILE_EXCL),
        ),
      );
      return { exported: true, files: sources.length };
    },
  });

  registry.register("library:exportClip", {
    input: z.object({
      id: z.string().uuid(),
      jobId: z.string().uuid(),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
    }),
    handle: async ({ id, jobId, startAt, endAt }) => {
      if (!config || !database) return { exported: false, jobId, gaps: [] };
      const result = await database.request("recording.segment.list", { recordingId: id });
      if (!result.ok) throw new Error("Não foi possível consultar os segmentos.");
      const root = resolve(config.recordingsDir || resolve(userDataPath, "recordings"));
      const sources: Array<RecordingSegmentRecord & { absolutePath: string }> = [];
      for (const segment of result.value as RecordingSegmentRecord[]) {
        try {
          sources.push({
            ...segment,
            absolutePath: await resolveLibraryFile(root, segment.path, new Set([".mp4", ".m4s"])),
          });
        } catch {
          // Missing segments become explicit gaps in the exported time range.
        }
      }
      if (sources.length === 0) throw new Error("Nenhum arquivo de vídeo está disponível.");
      const dialogOptions: Electron.SaveDialogOptions = {
        defaultPath: `trecho-${id.slice(0, 8)}.mp4`,
        filters: [{ name: "Vídeo MP4", extensions: ["mp4"] }],
        properties: ["showOverwriteConfirmation"],
      };
      const destination = mainWindow
        ? await dialog.showSaveDialog(mainWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);
      if (destination.canceled || !destination.filePath) return { exported: false, jobId, gaps: [] };
      await assertNewExportDestination(destination.filePath);
      const exported = await getClipExporter().export({
        recordingId: id,
        jobId,
        segments: sources,
        startAt,
        endAt,
        destinationPath: destination.filePath,
      });
      return { exported: true, jobId: exported.jobId, gaps: exported.gaps };
    },
  });

  registry.register("library:cancelClipExport", {
    input: z.object({ jobId: z.string().uuid() }),
    handle: ({ jobId }) => ({ cancelled: getClipExporter().cancel(jobId) }),
  });

  registry.register("library:clipExportStatus", {
    input: z.object({ jobId: z.string().uuid() }),
    handle: ({ jobId }) => getClipExporter().status(jobId),
  });

  registry.register("library:storageUsage", {
    input: EmptyRequestSchema,
    handle: async () => {
      if (!config || !database) return { freeBytes: null, totalBytes: null, usedBytes: 0, byCamera: [] };
      const recordingsRoot = resolve(config.recordingsDir || resolve(userDataPath, "recordings"));
      const snapshotsRoot = resolve(config.snapshotDir || resolve(userDataPath, "snapshots"));
      const key = `${recordingsRoot}\0${snapshotsRoot}`;
      if (libraryStorageCache?.key === key && libraryStorageCache.expiresAt > Date.now()) {
        return libraryStorageCache.value;
      }
      const bytesFor = async (root: string, path: string): Promise<number> => {
        try {
          const info = await stat(resolve(root, path));
          return info.isFile() ? info.size : 0;
        } catch {
          return 0;
        }
      };
      const totals = new Map<string, number>();
      const add = (cameraId: string, bytes: number): void => {
        totals.set(cameraId, (totals.get(cameraId) ?? 0) + bytes);
      };
      const snapshots = await database.request("snapshot.list", {});
      if (snapshots.ok) {
        for (const snapshot of snapshots.value as SnapshotRecord[]) {
          add(snapshot.cameraId, await bytesFor(snapshotsRoot, snapshot.path));
        }
      }
      const recordings = await database.request("recording.library", {});
      if (recordings.ok) {
        for (const recording of recordings.value as RecordingRecord[]) {
          const segments = await database.request("recording.segment.list", { recordingId: recording.id });
          if (!segments.ok) continue;
          for (const segment of segments.value as RecordingSegmentRecord[]) {
            add(recording.cameraId, await bytesFor(recordingsRoot, segment.path));
          }
        }
      }
      const { checkStorageStatus } = await import("./services/storage-monitor.js");
      const disk = await checkStorageStatus(recordingsRoot);
      const byCamera = [...totals.entries()]
        .map(([cameraId, bytes]) => ({ cameraId, bytes }))
        .sort((a, b) => b.bytes - a.bytes);
      const value = {
        freeBytes: disk.freeBytes,
        totalBytes: disk.totalBytes,
        usedBytes: byCamera.reduce((total, item) => total + item.bytes, 0),
        byCamera,
      };
      libraryStorageCache = { key, expiresAt: Date.now() + 30_000, value };
      return value;
    },
  });

  registry.register("schedules:list", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) => {
      if (!database) return [];
      const result = await database.request("schedule.list", { cameraId });
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
  });

  registry.register("schedules:replace", {
    input: z.object({ cameraId: z.string().uuid(), periods: z.array(SchedulePeriodSchema).max(56) }),
    handle: async ({ cameraId, periods }) => {
      if (!database) return { saved: false };
      const result = await database.request("schedule.replace", { cameraId, periods });
      if (!result.ok) throw new Error(result.error.message);
      await recordingScheduler?.refresh();
      return { saved: result.value === true };
    },
  });

  registry.register("schedules:status", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) => {
      const camera = await getCameraRecord(cameraId);
      if (!camera) throw new Error("Câmera não encontrada.");
      const periods = await database?.request("schedule.list", { cameraId });
      const schedule = periods?.ok ? periods.value as SchedulePeriod[] : [];
      const now = new Date();
      const active = isScheduledAt(schedule, now);
      const source = recordingSources.get(cameraId) ?? null;
      const suppressed = (scheduleSuppressedUntil.get(cameraId) ?? 0) > Date.now();
      const blocked = !camera.active ? "Câmera desativada." : suppressed ? "Pausada manualmente até o fim do período atual." : !active ? "Fora do horário programado." : source === "manual" ? "Gravação manual tem prioridade." : null;
      return { active, source, blocked, nextAt: nextScheduledAt(schedule, now)?.toISOString() ?? null, appMustRun: true };
    },
  });

  registry.register("alerts:list", {
    input: EmptyRequestSchema,
    handle: () => localAlerts.list(),
  });

  registry.register("retention:status", {
    input: EmptyRequestSchema,
    handle: () => retentionStatus,
  });

  registry.register("alerts:dismiss", {
    input: z.object({ id: z.string().min(1).max(160) }),
    handle: ({ id }) => ({ dismissed: localAlerts.dismiss(id) }),
  });

  registry.register("config:get", {
    input: EmptyRequestSchema,
    handle: () => config ?? null,
  });

  registry.register("config:save", {
    input: SaveConfigRequestSchema,
    handle: async ({ config: incoming }) => {
      if (!configRepository) return { saved: false };
      const parsed = AppConfigSchema.safeParse(incoming);
      if (!parsed.success) return { saved: false };
      await configRepository.save(parsed.data);
      await saveHardwareAcceleration(
        userDataPath,
        parsed.data.streams.enableHardwareAcceleration,
      );
      config = parsed.data;
      await withLibraryMutationLock(() => runRetentionCleanup());
      return { saved: true };
    },
  });

  registry.register("shell:openExternal", {
    input: OpenExternalRequestSchema,
    handle: async ({ url }) => {
      if (!isSafeExternalUrl(url)) {
        return { opened: false };
      }
      await shell.openExternal(url);
      return { opened: true };
    },
  });
}

const userDataPath = app.getPath("userData");
const databasePath = resolve(userDataPath, "simple-dvr-wifi.sqlite");
const backupDir = resolve(userDataPath, "backups");

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function migrateLegacyDevelopmentDatabase(): Promise<void> {
  if (process.env.SWC_TEST_USER_DATA || (await fileExists(databasePath)))
    return;

  const legacyPath = resolve(
    app.getPath("appData"),
    "Electron",
    "simple-dvr-wifi.sqlite",
  );
  if (legacyPath === databasePath || !(await fileExists(legacyPath))) return;

  await mkdir(userDataPath, { recursive: true });
  await copyFile(legacyPath, databasePath);
}

async function initializeDatabase(): Promise<void> {
  await migrateLegacyDevelopmentDatabase();
  database = new DatabaseSupervisor(
    createUtilityProcessTransport(databasePath, backupDir),
  );
  credentials = new CredentialService(
    database,
    new SafeStorageMasterKeyStore(safeStorage),
  );
  await credentials.initialize();
  cameraManagement = new CameraManagementService(database, credentials);
  configRepository = new ConfigRepository(database);
  config = await configRepository.load();
  // This startup preference is authoritative; older versions only stored an
  // unused checkbox in SQLite. Preserve their actual automatic GPU behavior.
  config.streams.enableHardwareAcceleration = hardwareAccelerationEnabled;
  const cameraList = await database.request("camera.list", undefined);
  if (cameraList.ok) {
    for (const camera of cameraList.value as CameraRecord[]) {
      const recordingList = await database.request("recording.list", {
        cameraId: camera.id,
      });
      if (!recordingList.ok) continue;
      for (const recording of recordingList.value as RecordingRecord[]) {
        if (!["starting", "recording", "stopping"].includes(recording.status))
          continue;
        await database.request("recording.complete", {
          id: recording.id,
          status: "interrupted",
        });
        const libraryRoot = config.recordingsDir || resolve(userDataPath, "recordings");
        await catalogRecordingFiles({
          recordingId: recording.id,
          startedAt: recording.startedAt,
          recordDir: resolve(libraryRoot, `${mediaPath(camera.id)}_main`),
        }, "interrupted");
      }
      await database.request("camera.setRecordingStatus", {
        cameraId: camera.id,
        status: "idle",
      });
    }
  }

  const mediaResources = resolve(userDataPath, "media");
  const mediaConfigDir = resolve(mediaResources, "config");
  const mediaBinariesDir = app.isPackaged
    ? resolve(process.resourcesPath, "mediamtx", process.platform)
    : resolve(projectRoot, "resources", "mediamtx", process.platform);
  const mediaManifestPath = app.isPackaged
    ? resolve(process.resourcesPath, "media-binaries.json")
    : resolve(projectRoot, "resources", "media-binaries.json");
  mediaSupervisor = new MediaSessionSupervisor({
    binaryPath: join(
      mediaBinariesDir,
      process.platform === "win32" ? "mediamtx.exe" : "mediamtx",
    ),
    expectedHash: expectedMediaMtxHashFromManifest(mediaManifestPath),
    configDir: mediaConfigDir,
  });
  recordingScheduler = new RecordingScheduler(reconcileScheduledRecordings);
  recordingScheduler.start();
  app.on("browser-window-focus", () => void recordingScheduler?.refresh());
  powerMonitor.on("resume", () => void recordingScheduler?.refresh());

  ptzRegistry = new PtzControllerRegistry({
    getAdapter: async (cameraId) => {
      const camera = await getCameraRecord(cameraId);
      const onvifUrl = camera?.endpoints.find(
        (endpoint) => endpoint.service === "onvif",
      )?.url;
      console.log(
        "[ptz:getAdapter]",
        cameraId,
        "onvifUrl=",
        onvifUrl ?? "(sem onvif)",
      );
      if (!onvifUrl) return null;
      const { OnvifAdapter, createFetchOnvifTransport } =
        await import("../workers/camera/onvif-adapter.js");
      const credential = await cameraCredential(cameraId, "onvif");
      console.log(
        "[ptz:getAdapter] credencial=",
        credential ? `user=${credential.username}` : "(sem credencial)",
      );
      const adapter = new OnvifAdapter({
        deviceServiceUrl: onvifUrl,
        username: credential?.username,
        password: credential?.password,
        transport: createFetchOnvifTransport(),
        timeoutMs: 10_000,
      });
      let ptzSupported = false;
      try {
        const info = await adapter.detect();
        ptzSupported = info.ptzSupported;
      } catch (error) {
        console.log(
          "[ptz:getAdapter] detect() erro:",
          error instanceof Error ? error.message : String(error),
        );
      }
      console.log("[ptz:getAdapter] ptzSupported=", ptzSupported);
      return ptzSupported ? adapter : null;
    },
  });
  shutdownCoordinator.register({
    name: "application-resources",
    stop: async () => {
      recordingScheduler?.stop();
      for (const cameraId of [...activeRecordings.keys()]) {
        await withRecordingLock(cameraId, () =>
          stopActiveRecording(cameraId, "interrupted"),
        );
      }
      await ptzRegistry?.shutdownAll();
      await mediaSupervisor?.shutdown();
      await database?.shutdown(3_000);
    },
  });
}

app.whenReady().then(async () => {
  registerApplicationProtocol();
  configureSessionSecurity();
  await initializeDatabase();
  registerIpcHandlers();
  mainWindow = createMainWindow();
  tray = createTray();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("web-contents-created", (_event, contents) => {
  const origins = [PACKAGED_RENDERER_ORIGIN];
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const origin = devServerOrigin(process.env.ELECTRON_RENDERER_URL);
    if (origin) origins.push(origin);
  }
  contents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigationUrl(url, origins)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

const SHUTDOWN_TIMEOUT_MS = 5_000;

async function performShutdown(): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  await shutdownCoordinator.shutdown(SHUTDOWN_TIMEOUT_MS);
}

app.on("before-quit", (event) => {
  isQuitting = true;
  if (shutdownCoordinator.size === 0 || shutdownStarted) return;
  event.preventDefault();
  void performShutdown().finally(() => app.quit());
});

app.on("will-quit", () => {
  tray?.destroy();
  tray = undefined;
});
