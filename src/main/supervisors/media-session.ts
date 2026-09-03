import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  generateMediaMtxConfig,
  generateSessionTokens,
  mediaMtxBinaryPath,
  sha256OfFile,
} from "../../workers/media/mediamtx-config.js";
import { sanitizeSidecarOutput } from "../logging/sanitizer.js";

export interface MediaProcessHandle {
  pid: number | undefined;
  kill(): void;
  onExit(callback: () => void): void;
}

export interface MediaProcessFactory {
  spawn(binaryPath: string, args: string[]): MediaProcessHandle;
}

export interface MediaSessionOptions {
  cameraId: string;
  rtspUrl: string;
  path: string;
  binaryPath: string;
  expectedHash: string;
  configDir: string;
  recordPath?: string;
  sourceOnDemand?: boolean;
  configFileName?: string;
  resourcesRoot?: string;
  processFactory?: MediaProcessFactory;
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

const MAX_RESTARTS = 3;
const CIRCUIT_TIMEOUT_MS = 10_000;

export class MediaSession {
  private process: MediaProcessHandle | null = null;
  private status: MediaSessionStatus = {
    state: "starting",
    restarts: 0,
    error: null,
  };
  private circuitOpen = false;
  private circuitTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private configResult: ReturnType<typeof generateMediaMtxConfig> | null = null;
  private startPromise: Promise<MediaSessionStatus> | null = null;
  private stopped = false;
  private exited = false;
  private readonly factory: MediaProcessFactory;

  constructor(private readonly options: MediaSessionOptions) {
    this.factory = options.processFactory ?? {
      spawn: (binaryPath, args) => {
        const child = spawn(binaryPath, args, {
          stdio: "ignore",
          windowsHide: true,
        });
        return {
          pid: child.pid,
          kill: () => child.kill(),
          onExit: (callback) => {
            child.once("exit", () => callback());
          },
        };
      },
    };
  }

  get statusNow(): MediaSessionStatus {
    return { ...this.status };
  }

  get ports(): { http: number; api: number } | null {
    if (!this.configResult) return null;
    return {
      http: this.configResult.httpPort,
      api: this.configResult.httpPort + 1,
    };
  }

  get whepToken(): string | null {
    return this.configResult?.webrtcToken ?? null;
  }

  whepEndpointFor(profile: "main" | "sub"): string | null {
    if (!this.configResult) return null;
    const path = this.options.path;
    void profile;
    return `http://127.0.0.1:${this.configResult.httpPort}/${path}/whep`;
  }

  async start(): Promise<MediaSessionStatus> {
    if (this.startPromise) return this.startPromise;
    const attempt = this.startInternal();
    this.startPromise = attempt;
    try {
      return await attempt;
    } finally {
      if (this.startPromise === attempt) this.startPromise = null;
    }
  }

  private async startInternal(): Promise<MediaSessionStatus> {
    if (this.stopped) return this.status;
    if (this.status.state === "running" && this.process) {
      return this.status;
    }

    if (this.circuitOpen) {
      this.status = { ...this.status, state: "circuit_open" };
      return this.status;
    }

    // Validate hash before executing the binary
    const { readFileSync } = await import("node:fs");
    let binaryBuffer: Buffer;
    try {
      binaryBuffer = readFileSync(this.options.binaryPath);
    } catch {
      this.status = {
        state: "crashed",
        restarts: this.status.restarts,
        error: "Binário MediaMTX não encontrado.",
      };
      return this.status;
    }

    if (
      this.options.expectedHash &&
      sha256OfFile(binaryBuffer).toLowerCase() !==
        this.options.expectedHash.toLowerCase()
    ) {
      this.status = {
        state: "crashed",
        restarts: this.status.restarts,
        error: "Hash do MediaMTX não confere.",
      };
      return this.status;
    }

    const tokens = generateSessionTokens();
    const httpPort = await availablePortBlock();
    this.configResult = generateMediaMtxConfig({
      rtspUrl: this.options.rtspUrl,
      path: this.options.path,
      apiToken: tokens.apiToken,
      webrtcToken: tokens.webrtcToken,
      rtmpToken: tokens.rtmpToken,
      srtToken: tokens.srtToken,
      httpPort,
      rtspPort: httpPort + 3,
      rtmpPort: httpPort + 4,
      webrtcUdpPort: httpPort + 2,
      configDir: this.options.configDir,
      recordPath: this.options.recordPath,
      sourceOnDemand: this.options.sourceOnDemand,
      configFileName: this.options.configFileName,
    });

    this.exited = false;
    let processHandle: MediaProcessHandle;
    try {
      processHandle = this.factory.spawn(this.options.binaryPath, [
        this.configResult.configPath,
      ]);
    } catch {
      this.status = {
        state: "crashed",
        restarts: this.status.restarts,
        error: "Não foi possível iniciar o processo MediaMTX.",
      };
      this.cleanupConfig();
      return this.status;
    }
    this.process = processHandle;
    processHandle.onExit(() => {
      if (this.process !== processHandle) return;
      this.exited = true;
      void this.handleCrash("Processo encerrado inesperadamente.");
    });

    if (!this.options.processFactory) {
      const ready = await waitForHttpListener(
        httpPort,
        () => this.exited,
        this.configResult.apiToken,
      );
      if (!ready) {
        await this.handleCrash(
          "MediaMTX não iniciou; verifique a configuração e o log do sidecar.",
        );
        return this.status;
      }
    }

    this.status = {
      state: "running",
      restarts: this.status.restarts,
      error: null,
    };
    this.startHealthCheck();
    return this.status;
  }

  async setRecording(enabled: boolean): Promise<boolean> {
    if (!this.configResult || this.status.state !== "running") return false;
    const payload: Record<string, unknown> = { record: enabled };
    try {
      const response = await fetch(
        `http://127.0.0.1:${this.configResult.httpPort + 1}/v3/config/paths/patch/${encodeURIComponent(this.options.path)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Basic ${Buffer.from(this.configResult.apiToken).toString("base64")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3_000),
        },
      );
      if (!response.ok) return false;
      if (!enabled) return true;

      const ready = await this.waitForSourceReady();
      if (!ready) await this.setRecording(false);
      return ready;
    } catch {
      return false;
    }
  }

  private async waitForSourceReady(): Promise<boolean> {
    if (!this.configResult) return false;
    const deadline = Date.now() + 10_000;
    const authorization = `Basic ${Buffer.from(this.configResult.apiToken).toString("base64")}`;
    do {
      try {
        const response = await fetch(
          `http://127.0.0.1:${this.configResult.httpPort + 1}/v3/paths/get/${encodeURIComponent(this.options.path)}`,
          {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(1_000),
          },
        );
        if (response.ok) {
          const path = (await response.json()) as { ready?: boolean };
          if (path.ready) return true;
        }
      } catch {
        // A origem pode ainda estar estabelecendo a sessão RTSP.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    } while (Date.now() < deadline);
    return false;
  }

  private startHealthCheck(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => {
      // no-op; real liveness is driven by onExit events
    }, 1_000);
    this.healthTimer.unref?.();
  }

  private async handleCrash(error: string): Promise<void> {
    if (this.stopped || this.status.state === "stopping") return;
    this.status = {
      state: "crashed",
      restarts: this.status.restarts,
      error: sanitizeSidecarOutput(error),
    };
    this.cleanupProcess();

    if (this.status.restarts >= MAX_RESTARTS) {
      this.openCircuit();
      return;
    }

    this.status = { ...this.status, restarts: this.status.restarts + 1 };
    this.restartTimer = setTimeout(() => void this.start(), 500);
    this.restartTimer.unref?.();
  }

  private openCircuit(): void {
    this.circuitOpen = true;
    this.status = {
      state: "circuit_open",
      restarts: this.status.restarts,
      error: "Reinícios excedidos; circuito aberto.",
    };
    if (this.circuitTimer) clearTimeout(this.circuitTimer);
    this.circuitTimer = setTimeout(() => {
      this.circuitOpen = false;
      this.status.restarts = 0;
      void this.start();
    }, CIRCUIT_TIMEOUT_MS);
    this.circuitTimer.unref?.();
  }

  private cleanupProcess(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.process) {
      const processHandle = this.process;
      this.process = null;
      processHandle.kill();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.circuitTimer) clearTimeout(this.circuitTimer);
    this.cleanupProcess();
    this.status = {
      state: "stopped",
      restarts: this.status.restarts,
      error: null,
    };
    this.cleanupConfig();
  }

  private cleanupConfig(): void {
    if (!this.configResult) return;
    try {
      rmSync(this.configResult.configPath, { force: true });
    } catch {
      // best-effort: a stale temp file is acceptable on error
    }
    this.configResult = null;
  }

  kill(): void {
    this.cleanupProcess();
  }
}

async function waitForHttpListener(
  port: number,
  exited: () => boolean,
  apiToken: string,
): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && !exited()) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port + 1}/v3/config/global/get`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(apiToken).toString("base64")}`,
          },
          signal: AbortSignal.timeout(250),
        },
      );
      if (response.ok) return true;
    } catch {
      // The sidecar can take a moment to bind its listeners.
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  return false;
}

async function availablePortBlock(): Promise<number> {
  const { createServer } = await import("node:net");
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = 15_000 + Math.floor(Math.random() * 35_000);
    const ports = [base, base + 1, base + 3, base + 4];
    const servers = ports.map(() => createServer());
    try {
      await Promise.all(
        servers.map(
          (server, index) =>
            new Promise<void>((resolve, reject) => {
              server.once("error", reject);
              server.listen(ports[index], "127.0.0.1", resolve);
            }),
        ),
      );
      return base;
    } catch {
      // retry another block
    } finally {
      await Promise.all(
        servers.map(
          (server) =>
            new Promise<void>((resolve) => {
              if (!server.listening) return resolve();
              server.close(() => resolve());
            }),
        ),
      );
    }
  }
  throw new Error("Não foi possível reservar portas locais para o MediaMTX.");
}

export class MediaSessionSupervisor {
  private readonly sessions = new Map<string, MediaSession>();

  constructor(
    private readonly options: Omit<
      MediaSessionOptions,
      "cameraId" | "rtspUrl" | "path"
    >,
  ) {}

  async acquire(
    cameraId: string,
    rtspUrl: string,
    path: string,
    recordPath?: string,
    sourceOnDemand?: boolean,
  ): Promise<MediaSessionStatus> {
    let session = this.sessions.get(cameraId);
    if (!session) {
      session = new MediaSession({
        ...this.options,
        cameraId,
        rtspUrl,
        path,
        recordPath,
        sourceOnDemand,
        binaryPath: this.options.binaryPath,
        configFileName: `${cameraId}.yml`,
      });
      this.sessions.set(cameraId, session);
    }
    return session.start();
  }

  status(cameraId: string): MediaSessionStatus | null {
    return this.sessions.get(cameraId)?.statusNow ?? null;
  }

  whepEndpoint(
    cameraId: string,
    profile: "main" | "sub",
  ): { url: string; token: string } | null {
    const session = this.sessions.get(cameraId);
    if (!session) return null;
    const url = session.whepEndpointFor(profile);
    const token = session.whepToken;
    if (!url || !token) return null;
    return { url, token };
  }

  async setRecording(cameraId: string, enabled: boolean): Promise<boolean> {
    const session = this.sessions.get(cameraId);
    return session ? session.setRecording(enabled) : false;
  }

  async release(cameraId: string): Promise<void> {
    const session = this.sessions.get(cameraId);
    if (!session) return;
    await session.stop();
    this.sessions.delete(cameraId);
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.release(id)));
  }

  get activeCount(): number {
    return this.sessions.size;
  }
}

export function mediaMtxConfigPathFor(
  configDir: string,
  cameraId: string,
): string {
  return join(configDir, `${cameraId}.yml`);
}

export { mediaMtxBinaryPath };
