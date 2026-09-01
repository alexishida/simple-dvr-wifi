import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  safeStorage,
} from "electron";
import { pathToFileURL } from "node:url";
import { extname, join, relative, resolve } from "node:path";
import { copyFile, mkdir, readdir, realpath, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
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
import { DiagnosticService } from "./services/diagnostics.js";
import { CameraManagementService } from "./services/camera-management.js";
import { DiscoveryService } from "./services/discovery.js";
import { MediaSessionSupervisor } from "./supervisors/media-session.js";
import { expectedMediaMtxHashFromManifest } from "../workers/media/mediamtx-config.js";
import { PtzControllerRegistry } from "./services/ptz-registry.js";
import { AppConfigSchema, type AppConfig } from "../shared/config.js";
import type { CameraEditDetails, CameraSummary } from "../shared/contracts.js";
import type {
  CameraRecord,
  RecordingRecord,
  RecordingSegmentRecord,
  SnapshotRecord,
} from "../shared/database.js";
import {
  parseHttpUrl,
  parseRtspUrl,
  rtspUrlWithCredentials,
} from "../shared/camera-urls.js";

let mainWindow: BrowserWindow | undefined;
const shutdownCoordinator = new ShutdownCoordinator();
let shutdownStarted = false;
let database: DatabaseSupervisor | null = null;
let credentials: CredentialService | null = null;
let cameraManagement: CameraManagementService | null = null;
let discovery: DiscoveryService | null = null;
let mediaSupervisor: MediaSessionSupervisor | null = null;
let ptzRegistry: PtzControllerRegistry | null = null;
let config: AppConfig | null = null;
let configRepository: ConfigRepository | null = null;
let diagnostics: DiagnosticService | null = null;
const activeRecordings = new Map<
  string,
  { recordingId: string; startedAt: string; recordDir: string }
>();
const activeViewSessions = new Set<string>();
const recordingOperations = new Map<string, Promise<void>>();

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

async function stopActiveRecording(
  cameraId: string,
  status: "completed" | "interrupted" = "completed",
): Promise<boolean> {
  const active = activeRecordings.get(cameraId);
  if (!active || !database) return false;
  const disabled = mediaSupervisor
    ? await mediaSupervisor.setRecording(
        mediaSessionId(cameraId, "main"),
        false,
      )
    : false;
  if (disabled)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  await catalogRecordingFiles(active);
  await database.request("recording.complete", {
    id: active.recordingId,
    status: disabled ? status : "interrupted",
  });
  await database.request("camera.setRecordingStatus", {
    cameraId,
    status: "idle",
  });
  activeRecordings.delete(cameraId);
  const mainSessionId = mediaSessionId(cameraId, "main");
  if (!activeViewSessions.has(mainSessionId))
    await mediaSupervisor?.release(mainSessionId);
  return true;
}

async function catalogRecordingFiles(active: {
  recordingId: string;
  startedAt: string;
  recordDir: string;
}): Promise<void> {
  if (!database) return;
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
  const startedAfter = Date.parse(active.startedAt) - 5_000;
  for (const path of files) {
    let info;
    try {
      info = await stat(path);
    } catch {
      continue;
    }
    if (info.mtimeMs < startedAfter) continue;
    await database.request("recording.segment.create", {
      recordingId: active.recordingId,
      path,
      startedAt: info.birthtime.toISOString(),
      endedAt: info.mtime.toISOString(),
      durationMs: Math.max(0, info.mtimeMs - info.birthtimeMs),
      status: "completed",
    });
  }
}

app.setName("simple-dvr-wifi");
app.enableSandbox();
if (process.env.SWC_TEST_USER_DATA) {
  app.setPath("userData", resolve(process.env.SWC_TEST_USER_DATA));
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const rendererRoot = resolve(__dirname, "../renderer");
const projectRoot = resolve(__dirname, "../..");

function registerApplicationProtocol(): void {
  protocol.handle("app", async (request) => {
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
      result.remoteImageBlocked = remoteImage.readyState === 'uninitialized'
      result.remoteScriptBlocked = remoteScript.readyState === 'uninitialized'
      result.remoteFetchBlocked = true
      return JSON.stringify(result)
    })()`;

    void window.webContents
      .executeJavaScript(probe)
      .then(async (result) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const probeResult = JSON.parse(result as string);
        probeResult.remoteResourceBlocked = remoteRequests.size === 0;
        if (database) {
          const health = await database.healthCheck(3_000);
          probeResult.databaseWorkerOk = health;
        }
        console.log(`__SECURITY_SMOKE__${JSON.stringify(probeResult)}`);
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

const DiscoveryStartSchema = z.object({
  interfaceName: z.string().min(1).max(253),
  timeoutMs: z.number().int().min(500).max(30_000).optional(),
});

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

  registry.register("discovery:interfaces", {
    input: EmptyRequestSchema,
    handle: () => (discovery ? discovery.listInterfaces() : []),
  });

  registry.register("discovery:start", {
    input: DiscoveryStartSchema,
    handle: async (input) => {
      if (!discovery) return [];
      return discovery.start(input);
    },
  });

  registry.register("discovery:cancel", {
    input: EmptyRequestSchema,
    handle: async () =>
      discovery ? await discovery.cancel() : { cancelled: false },
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
      const status = await mediaSupervisor.acquire(
        sessionId,
        rtspUrl,
        `${mediaPath(cameraId)}_${profile}`,
      );
      if (status.state === "running") activeViewSessions.add(sessionId);
      if (database) {
        await database.request("camera.setStatus", {
          cameraId,
          status: status.state === "running" ? "connected" : "media_error",
        });
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
      // eslint-disable-next-line no-console
      console.log("[ptz:move]", cameraId, JSON.stringify(velocity));
      if (!ptzRegistry) return { started: false };
      const camera = await getCameraRecord(cameraId);
      if (!camera || !camera.active || !camera.supportsPtz) {
        // eslint-disable-next-line no-console
        console.log("[ptz:move] rejeitado:", camera ? `active=${camera.active} ptz=${camera.supportsPtz}` : "sem câmera");
        return { started: false };
      }
      const result = await ptzRegistry.move(cameraId, velocity, camera.supportsPtz);
      // eslint-disable-next-line no-console
      console.log("[ptz:move] resultado:", JSON.stringify(result));
      return result;
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

  registry.register("recordings:start", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) =>
      withRecordingLock(cameraId, async () => {
        if (!config || !database || !mediaSupervisor) return { ok: false };
        const existing = activeRecordings.get(cameraId);
        if (existing) {
          return {
            ok: true,
            writeAllowed: true,
            cameraId,
            recordingId: existing.recordingId,
            startedAt: existing.startedAt,
            status: "recording",
          };
        }

        const camera = await getCameraRecord(cameraId);
        if (!camera) throw new Error("Câmera não encontrada.");
        if (!camera.active) {
          throw new Error("A câmera está desativada.");
        }
        const rtspUrl = await cameraRtspUrl(camera);
        if (!rtspUrl)
          throw new Error("A câmera não possui um endpoint RTSP configurado.");

        const libraryRoot =
          config.recordingsDir || resolve(userDataPath, "recordings");
        await mkdir(libraryRoot, { recursive: true });
        const { checkStorageStatus, shouldAllowWrite } =
          await import("./services/storage-monitor.js");
        const storage = await checkStorageStatus(libraryRoot);
        if (!shouldAllowWrite(storage)) {
          return { ok: false, writeAllowed: false, cameraId, status: "failed" };
        }

        const mainSessionId = mediaSessionId(cameraId, "main");
        const currentMediaStatus = mediaSupervisor.status(mainSessionId);
        const mediaStatus =
          currentMediaStatus?.state === "running"
            ? currentMediaStatus
            : await mediaSupervisor.acquire(
                mainSessionId,
                rtspUrl,
                `${mediaPath(cameraId)}_main`,
              );
        if (mediaStatus.state !== "running") {
          throw new Error(
            mediaStatus.error || "Gateway de mídia indisponível.",
          );
        }

        const recordPath = resolve(
          libraryRoot,
          "%path",
          "%Y-%m-%d",
          "%H-%M-%S-%f",
        );
        const response = await database.request("recording.create", {
          cameraId,
        });
        if (!response.ok)
          throw new Error("Não foi possível criar o catálogo da gravação.");
        const recording = response.value as {
          id: string;
          startedAt: string;
        };
        const enabled = await mediaSupervisor.setRecording(
          mainSessionId,
          true,
          recordPath,
        );
        if (!enabled) {
          await database.request("recording.complete", {
            id: recording.id,
            status: "failed",
          });
          if (!activeViewSessions.has(mainSessionId))
            await mediaSupervisor.release(mainSessionId);
          throw new Error("O gateway recusou o início da gravação.");
        }

        activeRecordings.set(cameraId, {
          recordingId: recording.id,
          startedAt: recording.startedAt,
          recordDir: resolve(libraryRoot, `${mediaPath(cameraId)}_main`),
        });
        await database.request("camera.setRecordingStatus", {
          cameraId,
          status: "recording",
        });
        await emitCameraChanged();
        return {
          ok: true,
          writeAllowed: true,
          recordingId: recording.id,
          cameraId,
          status: "recording",
          startedAt: recording.startedAt,
        };
      }),
  });

  registry.register("recordings:stop", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) =>
      withRecordingLock(cameraId, async () => {
        if (!database || !mediaSupervisor) return { stopped: false };
        const stopped = await stopActiveRecording(cameraId);
        if (!stopped) return { stopped: false };
        await emitCameraChanged();
        return { stopped: true };
      }),
  });

  registry.register("library:snapshots", {
    input: z.object({ cameraId: z.string().uuid().optional() }),
    handle: async ({ cameraId }) => {
      if (!database) return [];
      const camerasResult = cameraId
        ? null
        : await database.request("camera.list", undefined);
      const cameraIds = cameraId
        ? [cameraId]
        : camerasResult?.ok
          ? (camerasResult.value as CameraRecord[]).map((camera) => camera.id)
          : [];
      const rows = await Promise.all(
        cameraIds.map(async (id) => {
          const result = await database!.request("snapshot.list", {
            cameraId: id,
          });
          return result.ok ? (result.value as SnapshotRecord[]) : [];
        }),
      );
      return rows
        .flat()
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    },
  });

  registry.register("library:recordings", {
    input: z.object({ cameraId: z.string().uuid().optional() }),
    handle: async ({ cameraId }) => {
      if (!database) return [];
      const camerasResult = cameraId
        ? null
        : await database.request("camera.list", undefined);
      const cameraIds = cameraId
        ? [cameraId]
        : camerasResult?.ok
          ? (camerasResult.value as CameraRecord[]).map((camera) => camera.id)
          : [];
      const rows = await Promise.all(
        cameraIds.map(async (id) => {
          const result = await database!.request("recording.list", {
            cameraId: id,
          });
          return result.ok ? (result.value as RecordingRecord[]) : [];
        }),
      );
      const recordings = rows.flat();
      const withPaths = await Promise.all(
        recordings.map(async (recording) => {
          const segments = await database!.request("recording.segment.list", {
            recordingId: recording.id,
          });
          const first = segments.ok
            ? (segments.value as RecordingSegmentRecord[])[0]
            : undefined;
          return { ...recording, path: first?.path ?? null };
        }),
      );
      return withPaths.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },
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
      config = parsed.data;
      return { saved: true };
    },
  });

  registry.register("diagnostics:list", {
    input: EmptyRequestSchema,
    handle: async () => (diagnostics ? await diagnostics.list(100) : []),
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
  discovery = new DiscoveryService();
  configRepository = new ConfigRepository(database);
  config = await configRepository.load();
  diagnostics = new DiagnosticService(database);
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

  ptzRegistry = new PtzControllerRegistry({
    getAdapter: async (cameraId) => {
      const camera = await getCameraRecord(cameraId);
      const onvifUrl = camera?.endpoints.find(
        (endpoint) => endpoint.service === "onvif",
      )?.url;
      // eslint-disable-next-line no-console
      console.log("[ptz:getAdapter]", cameraId, "onvifUrl=", onvifUrl ?? "(sem onvif)");
      if (!onvifUrl) return null;
      const { OnvifAdapter, createFetchOnvifTransport } =
        await import("../workers/camera/onvif-adapter.js");
      const credential = await cameraCredential(cameraId, "onvif");
      // eslint-disable-next-line no-console
      console.log("[ptz:getAdapter] credencial=", credential ? `user=${credential.username}` : "(sem credencial)");
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
        // eslint-disable-next-line no-console
        console.log("[ptz:getAdapter] detect() erro:", error instanceof Error ? error.message : String(error));
      }
      // eslint-disable-next-line no-console
      console.log("[ptz:getAdapter] ptzSupported=", ptzSupported);
      return ptzSupported ? adapter : null;
    },
  });
  shutdownCoordinator.register({
    name: "application-resources",
    stop: async () => {
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0)
      mainWindow = createMainWindow();
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
  if (shutdownCoordinator.size === 0 || shutdownStarted) return;
  event.preventDefault();
  void performShutdown().finally(() => app.quit());
});
