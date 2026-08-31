import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  assertConfinedOutputPath,
  assertSafeArguments,
  FfmpegError,
  FfmpegRunner,
} from '../src/workers/media/ffmpeg-runner.js'

const BIN = process.env.FFMPEG_PATH ?? 'ffmpeg'

function hasFfmpeg(): boolean {
  try {
    return spawnSync(BIN, ['-version'], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}

describe('FFmpeg argument safety', () => {
  it('rejects shell metacharacters in arguments', () => {
    expect(() => assertSafeArguments(['rtsp://cam/stream; rm -rf /'])).toThrow(FfmpegError)
    expect(() => assertSafeArguments(['-i', 'rtsp://cam/stream && ls'])).toThrow(FfmpegError)
    expect(() => assertSafeArguments(['rtsp://cam/stream'])).not.toThrow()
    expect(() => assertSafeArguments(['-i', 'rtsp://user:pass@cam/stream'])).not.toThrow()
  })

  it('rejects output paths outside allowed directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-ff-'))
    expect(assertConfinedOutputPath(`${dir}\\out.mp4`, [dir])).toBe(`${dir}\\out.mp4`)
    expect(() => assertConfinedOutputPath('C:\\Windows\\evil.mp4', [dir])).toThrow(
      expect.objectContaining({ code: 'CONFINED' }),
    )
    expect(() => assertConfinedOutputPath('relative.mp4', [dir])).toThrow(
      expect.objectContaining({ code: 'CONFINED' }),
    )
  })
})

describe('FFmpeg runner', () => {
  it('runs FFmpeg without shell', async () => {
    if (!hasFfmpeg()) return
    const runner = new FfmpegRunner(BIN)
    const result = await runner.run({
      binaryPath: BIN,
      args: ['-version'],
      allowedOutputDirs: [tmpdir()],
    })
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('ffmpeg')
  })

  it('treats a URL with metacharacters as a literal argument', async () => {
    if (!hasFfmpeg()) return
    const runner = new FfmpegRunner(BIN)
    // A URL that looks like it has shell metacharacters must be treated literally and fail cleanly
    const result = await runner.run({
      binaryPath: BIN,
      args: ['-i', 'rtsp://cam/stream;touch-pwned', '-t', '0.1', '-f', 'null', '-'],
      allowedOutputDirs: [tmpdir()],
      timeoutMs: 5_000,
    })
    expect(result.output).not.toContain('pwned')
  })
})
