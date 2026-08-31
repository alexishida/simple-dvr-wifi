import { createServer, type Server } from 'node:net'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MediaSessionSupervisor,
  type MediaProcessFactory,
  type MediaProcessHandle,
} from '../src/main/supervisors/media-session.js'
import { StreamReferenceManager } from '../src/main/supervisors/stream-references.js'
import { sha256OfFile } from '../src/workers/media/mediamtx-config.js'
import { isLoopbackOnly } from '../src/workers/media/whep.js'

const LAYOUTS = [1, 4, 9, 16] as const
const BINARY_CONTENTS = Buffer.from('perf fake mediamtx binary')

interface Sample {
  rss: number
  heapUsed: number
  external: number
  cpuUser: number
  cpuSystem: number
}

function sample(cpuBefore: { user: number; system: number }): Sample {
  const cpu = process.cpuUsage(cpuBefore)
  const memory = process.memoryUsage()
  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    external: memory.external,
    cpuUser: cpu.user,
    cpuSystem: cpu.system,
  }
}

class LoopbackProcess implements MediaProcessHandle {
  pid: number | undefined = Math.floor(Math.random() * 100_000)
  killed = false
  private readonly servers: Server[] = []
  private exitCallback: (() => void) | null = null

  constructor(listenerCount = 2) {
    for (let i = 0; i < listenerCount; i++) {
      const server = createServer(() => {})
      server.listen(0, '127.0.0.1')
      this.servers.push(server)
    }
  }

  private allListening(): boolean {
    return this.servers.every((server) => {
      const address = server.address()
      return address !== null && typeof address === 'object'
    })
  }

  async waitListening(): Promise<void> {
    const deadline = Date.now() + 5_000
    while (!this.allListening()) {
      if (Date.now() > deadline) throw new Error('fake process did not bind in time')
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }

  listenerCount(): number {
    return this.servers.length
  }

  allLoopback(): boolean {
    return this.servers.every((server) => {
      const address = server.address()
      return (
        address !== null &&
        typeof address === 'object' &&
        (address.address === '127.0.0.1' ||
          address.address === '::1' ||
          address.address === '::ffff:127.0.0.1')
      )
    })
  }

  onExit(callback: () => void): void {
    this.exitCallback = callback
  }

  kill(): void {
    if (this.killed) return
    this.killed = true
    for (const server of this.servers) server.close()
    this.exitCallback?.()
  }
}

function loopbackFactory(processes: LoopbackProcess[]): MediaProcessFactory {
  return {
    spawn: (): MediaProcessHandle => {
      const proc = new LoopbackProcess()
      processes.push(proc)
      void proc.waitListening()
      return proc
    },
  }
}

function setupSupervisor(dir: string, processes: LoopbackProcess[]): MediaSessionSupervisor {
  const binaryPath = join(dir, 'mediamtx.exe')
  writeFileSync(binaryPath, BINARY_CONTENTS)
  return new MediaSessionSupervisor({
    binaryPath,
    expectedHash: sha256OfFile(BINARY_CONTENTS),
    configDir: join(dir, 'config'),
    processFactory: loopbackFactory(processes),
  })
}

interface LayoutMetrics {
  layout: number
  acquireMs: number
  peakRssBytes: number
  heapDeltaBytes: number
  cpuUserMs: number
  cpuSystemMs: number
  processes: number
  listeners: number
  loopbackOnly: boolean
  configFiles: number
  configFilesAfterShutdown: number
  sessionsAfterShutdown: number
  processesAfterShutdown: number
}

const REPORT: LayoutMetrics[] = []

function record(metrics: LayoutMetrics): void {
  REPORT.push(metrics)
  if (process.env.PERF_BASELINE_REPORT !== '1') return
  const payload = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    generatedAt: new Date().toISOString(),
    layouts: REPORT,
  }
  const target = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'docs',
    'performance',
    `baseline-${process.platform}-${process.arch}.json`,
  )
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(payload, null, 2))
}

describe('performance baseline for 1/4/9/16 layouts', () => {
  for (const layout of LAYOUTS) {
    it(`acquires, measures and releases ${layout} sessions without leaks`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'swc-perf-'))
      const configDir = join(dir, 'config')
      const processes: LoopbackProcess[] = []
      const supervisor = setupSupervisor(dir, processes)

      const cpuBefore = process.cpuUsage()
      const baseline = sample(cpuBefore)
      const start = performance.now()

      for (let i = 0; i < layout; i++) {
        const status = await supervisor.acquire(
          `cam-${i}`,
          `rtsp://127.0.0.1:${5000 + i}/simulated`,
          `camera${i}`,
        )
        expect(status.state).toBe('running')
      }
      await Promise.all(processes.map((p) => p.waitListening()))

      const acquireMs = performance.now() - start
      const afterAcquire = sample(cpuBefore)

      for (let i = 0; i < layout; i++) {
        const endpoint = supervisor.whepEndpoint(`cam-${i}`, 'sub')
        expect(endpoint).not.toBeNull()
        expect(isLoopbackOnly(endpoint?.url ?? '')).toBe(true)
      }

      const configFiles = readdirSync(configDir).filter((f) => f.endsWith('.yml')).length
      const listeners = processes.reduce((sum, p) => sum + p.listenerCount(), 0)
      const loopbackOnly = processes.every((p) => p.allLoopback())

      expect(supervisor.activeCount).toBe(layout)
      expect(processes.length).toBe(layout)
      expect(configFiles).toBe(layout)
      expect(listeners).toBe(layout * 2)
      expect(loopbackOnly).toBe(true)

      await supervisor.shutdown()

      const afterShutdown = readdirSync(configDir).filter((f) => f.endsWith('.yml'))
      const metrics: LayoutMetrics = {
        layout,
        acquireMs: Math.round(acquireMs),
        peakRssBytes: afterAcquire.rss,
        heapDeltaBytes: Math.max(0, afterAcquire.heapUsed - baseline.heapUsed),
        cpuUserMs: Math.round(afterAcquire.cpuUser / 1000),
        cpuSystemMs: Math.round(afterAcquire.cpuSystem / 1000),
        processes: processes.length,
        listeners,
        loopbackOnly,
        configFiles,
        configFilesAfterShutdown: afterShutdown.length,
        sessionsAfterShutdown: supervisor.activeCount,
        processesAfterShutdown: processes.filter((p) => !p.killed).length,
      }

      expect(metrics.sessionsAfterShutdown).toBe(0)
      expect(metrics.processesAfterShutdown).toBe(0)
      expect(metrics.configFilesAfterShutdown).toBe(0)

      record(metrics)
      rmSync(dir, { recursive: true, force: true })
    }, 30_000)
  }

  it('keeps stream references at zero after release cycles', () => {
    const manager = new StreamReferenceManager()
    const leases: Array<{ release(): void }> = []
    for (let cycle = 0; cycle < 50; cycle++) {
      for (let i = 0; i < 16; i++) {
        leases.push(manager.acquire({ cameraId: `cam-${i}`, profile: 'sub' }))
      }
      for (const lease of leases.splice(0)) lease.release()
      expect(manager.snapshot()).toHaveLength(0)
    }
  })

  it('binds only loopback addresses on every session endpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-perf-net-'))
    const processes: LoopbackProcess[] = []
    const supervisor = setupSupervisor(dir, processes)
    await supervisor.acquire('cam-1', 'rtsp://127.0.0.1/stream', 'camera1')
    await processes[0]?.waitListening()
    expect(processes[0]?.allLoopback()).toBe(true)
    await supervisor.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  it('does not accumulate config files across repeated lifecycles', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-perf-cycle-'))
    const configDir = join(dir, 'config')
    const processes: LoopbackProcess[] = []
    const supervisor = setupSupervisor(dir, processes)

    for (let cycle = 0; cycle < 10; cycle++) {
      await supervisor.acquire('cam-1', 'rtsp://127.0.0.1/stream', 'camera1')
      expect(existsSync(join(configDir, 'cam-1.yml'))).toBe(true)
      await supervisor.release('cam-1')
      expect(existsSync(join(configDir, 'cam-1.yml'))).toBe(false)
    }
    expect(readdirSync(configDir).filter((f) => f.endsWith('.yml'))).toHaveLength(0)
    await supervisor.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })
})
