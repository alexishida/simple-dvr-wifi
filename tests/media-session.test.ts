import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MediaSessionSupervisor,
  type MediaProcessFactory,
  type MediaProcessHandle,
} from '../src/main/supervisors/media-session.js'
import { sha256OfFile } from '../src/workers/media/mediamtx-config.js'

const BINARY_CONTENTS = Buffer.from('fake mediamtx binary')

class FakeProcess implements MediaProcessHandle {
  pid: number | undefined = Math.floor(Math.random() * 10000)
  killed = false
  private exitCallback: (() => void) | null = null
  onExit(callback: () => void): void {
    this.exitCallback = callback
  }
  kill(): void {
    this.killed = true
  }
  crash(): void {
    this.exitCallback?.()
  }
}

function fakeFactory(processes: FakeProcess[] = []): MediaProcessFactory {
  return {
    spawn: (): MediaProcessHandle => {
      const proc = new FakeProcess()
      processes.push(proc)
      return proc
    },
  }
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'swc-media-'))
  const binaryPath = join(dir, 'mediamtx.exe')
  const configDir = join(dir, 'config')
  const processes: FakeProcess[] = []
  const factory = fakeFactory(processes)
  return { dir, binaryPath, configDir, processes, factory }
}

describe('MediaSessionSupervisor', () => {
  it('validates the binary hash before starting', async () => {
    const { binaryPath, configDir, factory } = setup()
    const { writeFileSync } = await import('node:fs')
    writeFileSync(binaryPath, BINARY_CONTENTS)

    const supervisor = new MediaSessionSupervisor({
      binaryPath,
      expectedHash: 'wrong-hash',
      configDir,
      processFactory: factory,
    })

    const status = await supervisor.acquire('cam-1', 'rtsp://cam/stream', 'camera1')
    expect(status.state).toBe('crashed')
    expect(status.error).toContain('Hash')
    expect(supervisor.activeCount).toBe(1)
    await supervisor.shutdown()
  })

  it('starts a session when hash matches and runs on loopback', async () => {
    const { binaryPath, configDir, factory } = setup()
    const supervisor = new MediaSessionSupervisor({
      binaryPath,
      expectedHash: sha256OfFile(BINARY_CONTENTS),
      configDir,
      processFactory: factory,
    })

    // write the fake binary
    const { writeFileSync } = await import('node:fs')
    writeFileSync(binaryPath, BINARY_CONTENTS)

    const status = await supervisor.acquire('cam-1', 'rtsp://cam/stream', 'camera1')
    expect(status.state).toBe('running')
    await supervisor.shutdown()
  })

  it('reuses an existing session for the same camera', async () => {
    const { binaryPath, configDir, factory, processes } = setup()
    const { writeFileSync } = await import('node:fs')
    writeFileSync(binaryPath, BINARY_CONTENTS)

    const supervisor = new MediaSessionSupervisor({
      binaryPath,
      expectedHash: sha256OfFile(BINARY_CONTENTS),
      configDir,
      processFactory: factory,
    })

    await supervisor.acquire('cam-1', 'rtsp://cam/stream', 'camera1')
    await supervisor.acquire('cam-1', 'rtsp://cam/stream', 'camera1')
    expect(processes.length).toBe(1)
    await supervisor.shutdown()
  })

  it('isolates a crash/restart per camera without stopping another', async () => {
    const { binaryPath, configDir, factory, processes } = setup()
    const { writeFileSync } = await import('node:fs')
    writeFileSync(binaryPath, BINARY_CONTENTS)

    const supervisor = new MediaSessionSupervisor({
      binaryPath,
      expectedHash: sha256OfFile(BINARY_CONTENTS),
      configDir,
      processFactory: factory,
    })

    const statusA = await supervisor.acquire('cam-a', 'rtsp://a/stream', 'cameraA')
    const statusB = await supervisor.acquire('cam-b', 'rtsp://b/stream', 'cameraB')
    expect(statusA.state).toBe('running')
    expect(statusB.state).toBe('running')

    // Crash cam-a's process only
    processes[0]?.crash?.()
    await new Promise((resolve) => setTimeout(resolve, 100))

    const afterA = supervisor.status('cam-a')
    expect(afterA?.state).toBe('crashed')
    const afterB = supervisor.status('cam-b')
    expect(afterB?.state).toBe('running')

    await supervisor.shutdown()
  })

  it('releases and removes a session', async () => {
    const { binaryPath, configDir, factory } = setup()
    const { writeFileSync } = await import('node:fs')
    writeFileSync(binaryPath, BINARY_CONTENTS)

    const supervisor = new MediaSessionSupervisor({
      binaryPath,
      expectedHash: sha256OfFile(BINARY_CONTENTS),
      configDir,
      processFactory: factory,
    })

    await supervisor.acquire('cam-1', 'rtsp://cam/stream', 'camera1')
    expect(supervisor.activeCount).toBe(1)
    await supervisor.release('cam-1')
    expect(supervisor.activeCount).toBe(0)
  })
})

describe('MediaMTX config', () => {
  it('generates a config bound to loopback only', async () => {
    const { generateMediaMtxConfig, generateSessionTokens } =
      await import('../src/workers/media/mediamtx-config.js')
    const dir = mkdtempSync(join(tmpdir(), 'swc-mtx-'))
    const tokens = generateSessionTokens()
    const result = generateMediaMtxConfig({
      rtspUrl: 'rtsp://cam/stream',
      path: 'camera1',
      apiToken: tokens.apiToken,
      webrtcToken: tokens.webrtcToken,
      rtmpToken: tokens.rtmpToken,
      srtToken: tokens.srtToken,
      httpPort: 16000,
      rtspPort: 16001,
      rtmpPort: 16002,
      configDir: dir,
    })

    const { readFileSync } = await import('node:fs')
    const content = readFileSync(result.configPath, 'utf8')
    expect(content).toContain('127.0.0.1')
    expect(content).not.toMatch(/0\.0\.0\.0/)
    expect(content).toContain('source: rtsp://cam/stream')
    expect(content).toContain(`sourceOnDemand: yes`)
  })
})

describe('MediaMTX multi-camera config isolation', () => {
  it('writes a distinct config file per camera name', async () => {
    const { generateMediaMtxConfig, generateSessionTokens } =
      await import('../src/workers/media/mediamtx-config.js')
    const dir = mkdtempSync(join(tmpdir(), 'swc-mtx-iso-'))
    const tokens = generateSessionTokens()
    const first = generateMediaMtxConfig({
      rtspUrl: 'rtsp://cam-a/stream',
      path: 'cameraA',
      apiToken: tokens.apiToken,
      webrtcToken: tokens.webrtcToken,
      rtmpToken: tokens.rtmpToken,
      srtToken: tokens.srtToken,
      httpPort: 16000,
      rtspPort: 16001,
      rtmpPort: 16002,
      configDir: dir,
      configFileName: 'camera-a.yml',
    })
    const second = generateMediaMtxConfig({
      rtspUrl: 'rtsp://cam-b/stream',
      path: 'cameraB',
      apiToken: tokens.apiToken,
      webrtcToken: tokens.webrtcToken,
      rtmpToken: tokens.rtmpToken,
      srtToken: tokens.srtToken,
      httpPort: 16010,
      rtspPort: 16011,
      rtmpPort: 16012,
      configDir: dir,
      configFileName: 'camera-b.yml',
    })

    const { readFileSync } = await import('node:fs')
    expect(first.configPath).not.toBe(second.configPath)
    expect(readFileSync(first.configPath, 'utf8')).toContain('rtsp://cam-a/stream')
    expect(readFileSync(second.configPath, 'utf8')).toContain('rtsp://cam-b/stream')
    expect(readFileSync(first.configPath, 'utf8')).toContain('camera-a.log')
    expect(readFileSync(second.configPath, 'utf8')).toContain('camera-b.log')
  })

  it('removes the config file after a session stops', async () => {
    const { writeFileSync } = await import('node:fs')
    const dir = mkdtempSync(join(tmpdir(), 'swc-mtx-clean-'))
    const binaryPath = join(dir, 'mediamtx.exe')
    writeFileSync(binaryPath, BINARY_CONTENTS)

    const supervisor = new MediaSessionSupervisor({
      binaryPath,
      expectedHash: sha256OfFile(BINARY_CONTENTS),
      configDir: dir,
      processFactory: fakeFactory(),
    })

    await supervisor.acquire('cam-1', 'rtsp://cam/stream', 'camera1')
    const configPath = join(dir, 'cam-1.yml')
    const { existsSync } = await import('node:fs')
    expect(existsSync(configPath)).toBe(true)

    await supervisor.release('cam-1')
    expect(existsSync(configPath)).toBe(false)
  })

  it('keeps distinct sessions for a 16-camera layout without clobbering configs', async () => {
    const { writeFileSync, readFileSync, existsSync } = await import('node:fs')
    const dir = mkdtempSync(join(tmpdir(), 'swc-mtx-16-'))
    const binaryPath = join(dir, 'mediamtx.exe')
    writeFileSync(binaryPath, BINARY_CONTENTS)

    const supervisor = new MediaSessionSupervisor({
      binaryPath,
      expectedHash: sha256OfFile(BINARY_CONTENTS),
      configDir: dir,
      processFactory: fakeFactory(),
    })

    for (let i = 0; i < 16; i++) {
      const status = await supervisor.acquire(
        `cam-${i}`,
        `rtsp://127.0.0.1:${5000 + i}/simulated`,
        `camera${i}`,
      )
      expect(status.state).toBe('running')
    }

    for (let i = 0; i < 16; i++) {
      const configPath = join(dir, `cam-${i}.yml`)
      expect(existsSync(configPath)).toBe(true)
      expect(readFileSync(configPath, 'utf8')).toContain(`rtsp://127.0.0.1:${5000 + i}/simulated`)
    }

    await supervisor.shutdown()
    for (let i = 0; i < 16; i++) {
      expect(existsSync(join(dir, `cam-${i}.yml`))).toBe(false)
    }
  })
})
