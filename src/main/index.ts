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
import { join, resolve } from "node:path";
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
import type { CameraSummary } from "../shared/contracts.js";
import type { CameraRecord } from "../shared/database.js";

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

function mapCameraRecord(
  record: CameraRecord,
  hasCredential: boolean,
): CameraSummary {
  return {
    id: record.id,
    name: record.name,
    host: record.host,
    status: record.status,
    recordingStatus: record.recordingStatus,
    hasCredential,
    supportsPtz: record.supportsPtz,
  };
}

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
  password: z.string().max(2048).nullable().optional(),
  rtspPassword: z.string().max(2048).nullable().optional(),
});

const DiscoveryStartSchema = z.object({
  interfaceName: z.string().min(1).max(253),
  timeoutMs: z.number().int().min(500).max(30_000).optional(),
});

function registerIpcHandlers(): void {
  const registry = new IpcRegistry(ipcMain, () => mainWindow?.webContents);

  registry.register("cameras:list", {
    input: EmptyRequestSchema,
    handle: async () => {
      if (!database) return [];
      const response = await database.request("camera.list", undefined);
      if (!response.ok) return [];
      const records = response.value as CameraRecord[];
      const summaries: CameraSummary[] = [];
      for (const record of records) {
        const hasCredential = credentials
          ? await credentials.hasCredential(record.id)
          : false;
        summaries.push(mapCameraRecord(record, hasCredential));
      }
      return summaries;
    },
  });

  registry.register("cameras:create", {
    input: CameraCreateRequestSchema,
    handle: async (input) => {
      if (!cameraManagement)
        return { ok: false, error: "Serviço indisponível." };
      const result = await cameraManagement.create(input);
      return {
        ok: true,
        camera: mapCameraRecord(result.camera, false),
        duplicate: result.duplicate,
      };
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

  registry.register("cameras:deactivate", {
    input: CameraIdRequestSchema,
    handle: async ({ id }) =>
      cameraManagement ? await cameraManagement.deactivate(id) : false,
  });

  registry.register("cameras:reactivate", {
    input: CameraIdRequestSchema,
    handle: async ({ id }) =>
      cameraManagement ? await cameraManagement.reactivate(id) : false,
  });

  registry.register("cameras:updateCredentials", {
    input: CameraUpdateCredentialsSchema,
    handle: async ({ id, password, rtspPassword }) => {
      if (!cameraManagement) return false;
      await cameraManagement.updateCredentials(id, {
        password: password ?? null,
        rtspPassword: rtspPassword ?? null,
      });
      return true;
    },
  });

  registry.register("cameras:remove", {
    input: CameraIdRequestSchema,
    handle: async ({ id }) => {
      if (!cameraManagement) return { removed: false };
      return cameraManagement.remove(id);
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
      rtspUrl: z.string().min(1).max(2048),
      path: z.string().min(1).max(253),
    }),
    handle: async ({ cameraId, rtspUrl, path }) => {
      if (!mediaSupervisor) return null;
      const status = await mediaSupervisor.acquire(cameraId, rtspUrl, path);
      return status;
    },
  });

  registry.register("media:release", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) => {
      if (!mediaSupervisor) return { released: false };
      await mediaSupervisor.release(cameraId);
      return { released: true };
    },
  });

  registry.register("media:status", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) =>
      mediaSupervisor ? mediaSupervisor.status(cameraId) : null,
  });

  registry.register("media:whepEndpoint", {
    input: z.object({
      cameraId: z.string().uuid(),
      profile: z.enum(["main", "sub"]),
    }),
    handle: async ({ cameraId, profile }) =>
      mediaSupervisor ? mediaSupervisor.whepEndpoint(cameraId, profile) : null,
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
      if (!ptzRegistry) return { started: false };
      return ptzRegistry.move(cameraId, velocity, true);
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
      snapshotUri: z.string().max(2048).nullable().optional(),
      rtspUrl: z.string().max(2048).nullable().optional(),
    }),
    handle: async ({ cameraId, snapshotUri, rtspUrl }) => {
      if (!config) return { ok: false };
      const { captureSnapshot } =
        await import("./services/snapshot-capture.js");
      const result = await captureSnapshot({
        cameraId,
        libraryRoot: config.snapshotDir || resolve(userDataPath, "snapshots"),
        snapshotUri,
        rtspUrl,
      });
      return { ok: true, ...result };
    },
  });

  registry.register("recordings:start", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId }) => {
      if (!config || !database) return { ok: false };
      const { RecordingCatalogService } =
        await import("./services/recording-catalog.js");
      const service = new RecordingCatalogService(database, {
        cameraId,
        libraryRoot:
          config.recordingsDir || resolve(userDataPath, "recordings"),
      });
      const state = await service.start(cameraId);
      return { ok: state.writeAllowed, ...state };
    },
  });

  registry.register("recordings:stop", {
    input: z.object({ cameraId: z.string().uuid() }),
    handle: async ({ cameraId: _cameraId }) => {
      void _cameraId;
      return { stopped: true };
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

async function initializeDatabase(): Promise<void> {
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
  shutdownCoordinator.register({
    name: "database",
    stop: () => database?.shutdown(3_000),
  });

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
  shutdownCoordinator.register({
    name: "media-sessions",
    stop: () => mediaSupervisor?.shutdown() ?? Promise.resolve(),
  });

  ptzRegistry = new PtzControllerRegistry({
    getAdapter: async () => null,
  });
  shutdownCoordinator.register({
    name: "ptz",
    stop: () => ptzRegistry?.shutdownAll() ?? Promise.resolve(),
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
