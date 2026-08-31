import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  generateMediaMtxConfig,
  generateSessionTokens,
  mediaMtxBinaryPath,
  sha256OfFile,
} from '../../workers/media/mediamtx-config.js'
import { sanitizeSidecarOutput } from '../logging/sanitizer.js'

export interface MediaProcessHandle {
  pid: number | undefined
  kill(): void
  onExit(callback: () => void): void
}

export interface MediaProcessFactory {
  spawn(binaryPath: string, args: string[]): MediaProcessHandle
}

export interface MediaSessionOptions {
  cameraId: string
  rtspUrl: string
  path: string
  binaryPath: string
  expectedHash: string
  configDir: string
  configFileName?: string
  resourcesRoot?: string
  processFactory?: MediaProcessFactory
}

export interface MediaSessionStatus {
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed' | 'circuit_open'
  restarts: number
  error: string | null
}

const MAX_RESTARTS = 3
const CIRCUIT_TIMEOUT_MS = 10_000

export class MediaSession {
  private process: MediaProcessHandle | null = null
  private status: MediaSessionStatus = { state: 'starting', restarts: 0, error: null }
  private circuitOpen = false
  private circuitTimer: NodeJS.Timeout | null = null
  private healthTimer: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private configResult: ReturnType<typeof generateMediaMtxConfig> | null = null
  private stopped = false
  private readonly factory: MediaProcessFactory

  constructor(private readonly options: MediaSessionOptions) {
    this.factory = options.processFactory ?? {
      spawn: (binaryPath, args) => {
        const child = spawn(binaryPath, args, { stdio: 'ignore', windowsHide: true })
        return {
          pid: child.pid,
          kill: () => child.kill(),
          onExit: (callback) => {
            child.once('exit', () => callback())
          },
        }
      },
    }
  }

  get statusNow(): MediaSessionStatus {
    return { ...this.status }
  }

  get ports(): { http: number; api: number } | null {
    if (!this.configResult) return null
    return { http: this.configResult.httpPort, api: this.configResult.httpPort + 1 }
  }

  get whepToken(): string | null {
    return this.configResult?.webrtcToken ?? null
  }

  whepEndpointFor(profile: 'main' | 'sub'): string | null {
    if (!this.configResult) return null
    const path = this.options.path
    const profileSuffix = profile === 'sub' ? '_sub' : ''
    return `http://127.0.0.1:${this.configResult.httpPort}/${path}${profileSuffix}/whep`
  }

  async start(): Promise<MediaSessionStatus> {
    if (this.stopped) return this.status
    if (this.status.state === 'running' && this.process) {
      return this.status
    }

    if (this.circuitOpen) {
      this.status = { ...this.status, state: 'circuit_open' }
      return this.status
    }

    // Validate hash before executing the binary
    const { readFileSync } = await import('node:fs')
    let binaryBuffer: Buffer
    try {
      binaryBuffer = readFileSync(this.options.binaryPath)
    } catch {
      this.status = {
        state: 'crashed',
        restarts: this.status.restarts,
        error: 'Binário MediaMTX não encontrado.',
      }
      return this.status
    }

    if (this.options.expectedHash && sha256OfFile(binaryBuffer) !== this.options.expectedHash) {
      this.status = {
        state: 'crashed',
        restarts: this.status.restarts,
        error: 'Hash do MediaMTX não confere.',
      }
      return this.status
    }

    const tokens = generateSessionTokens()
    this.configResult = generateMediaMtxConfig({
      rtspUrl: this.options.rtspUrl,
      path: this.options.path,
      apiToken: tokens.apiToken,
      webrtcToken: tokens.webrtcToken,
      rtmpToken: tokens.rtmpToken,
      srtToken: tokens.srtToken,
      httpPort: randomPort(),
      rtspPort: randomPort(),
      rtmpPort: randomPort(),
      configDir: this.options.configDir,
      configFileName: this.options.configFileName,
    })

    this.process = this.factory.spawn(this.options.binaryPath, [this.configResult.configPath])
    this.process.onExit(() => {
      void this.handleCrash('Processo encerrado inesperadamente.')
    })

    this.status = { state: 'running', restarts: this.status.restarts, error: null }
    this.startHealthCheck()
    return this.status
  }

  private startHealthCheck(): void {
    if (this.healthTimer) clearInterval(this.healthTimer)
    this.healthTimer = setInterval(() => {
      // no-op; real liveness is driven by onExit events
    }, 1_000)
    this.healthTimer.unref?.()
  }

  private async handleCrash(error: string): Promise<void> {
    if (this.stopped || this.status.state === 'stopping') return
    this.status = {
      state: 'crashed',
      restarts: this.status.restarts,
      error: sanitizeSidecarOutput(error),
    }
    this.cleanupProcess()

    if (this.status.restarts >= MAX_RESTARTS) {
      this.openCircuit()
      return
    }

    this.status = { ...this.status, restarts: this.status.restarts + 1 }
    this.restartTimer = setTimeout(() => void this.start(), 500)
    this.restartTimer.unref?.()
  }

  private openCircuit(): void {
    this.circuitOpen = true
    this.status = {
      state: 'circuit_open',
      restarts: this.status.restarts,
      error: 'Reinícios excedidos; circuito aberto.',
    }
    if (this.circuitTimer) clearTimeout(this.circuitTimer)
    this.circuitTimer = setTimeout(() => {
      this.circuitOpen = false
      this.status.restarts = 0
      void this.start()
    }, CIRCUIT_TIMEOUT_MS)
    this.circuitTimer.unref?.()
  }

  private cleanupProcess(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.circuitTimer) clearTimeout(this.circuitTimer)
    this.cleanupProcess()
    this.status = { state: 'stopped', restarts: this.status.restarts, error: null }
    this.cleanupConfig()
  }

  private cleanupConfig(): void {
    if (!this.configResult) return
    try {
      rmSync(this.configResult.configPath, { force: true })
    } catch {
      // best-effort: a stale temp file is acceptable on error
    }
    this.configResult = null
  }

  kill(): void {
    this.cleanupProcess()
  }
}

function randomPort(): number {
  return 15_000 + Math.floor(Math.random() * 20_000)
}

export class MediaSessionSupervisor {
  private readonly sessions = new Map<string, MediaSession>()

  constructor(
    private readonly options: Omit<MediaSessionOptions, 'cameraId' | 'rtspUrl' | 'path'>,
  ) {}

  async acquire(cameraId: string, rtspUrl: string, path: string): Promise<MediaSessionStatus> {
    let session = this.sessions.get(cameraId)
    if (!session) {
      session = new MediaSession({
        ...this.options,
        cameraId,
        rtspUrl,
        path,
        binaryPath: this.options.binaryPath,
        configFileName: `${cameraId}.yml`,
      })
      this.sessions.set(cameraId, session)
    }
    return session.start()
  }

  status(cameraId: string): MediaSessionStatus | null {
    return this.sessions.get(cameraId)?.statusNow ?? null
  }

  whepEndpoint(cameraId: string, profile: 'main' | 'sub'): { url: string; token: string } | null {
    const session = this.sessions.get(cameraId)
    if (!session) return null
    const url = session.whepEndpointFor(profile)
    const token = session.whepToken
    if (!url || !token) return null
    return { url, token }
  }

  async release(cameraId: string): Promise<void> {
    const session = this.sessions.get(cameraId)
    if (!session) return
    await session.stop()
    this.sessions.delete(cameraId)
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.release(id)))
  }

  get activeCount(): number {
    return this.sessions.size
  }
}

export function mediaMtxConfigPathFor(configDir: string, cameraId: string): string {
  return join(configDir, `${cameraId}.yml`)
}

export { mediaMtxBinaryPath }
