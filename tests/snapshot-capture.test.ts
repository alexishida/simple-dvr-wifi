import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { captureSnapshot } from '../src/main/services/snapshot-capture.js'
import type { FfmpegRunner } from '../src/workers/media/ffmpeg-runner.js'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x42, 0x42])

function fakeRunner(outputFile: string): FfmpegRunner {
  return {
    run: async () => {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(outputFile, JPEG)
      return { exitCode: 0, killed: false, timedOut: false, output: '', durationMs: 10 }
    },
  } as unknown as FfmpegRunner
}

function failingRunner(): FfmpegRunner {
  return {
    run: async () => ({
      exitCode: 1,
      killed: false,
      timedOut: false,
      output: 'error',
      durationMs: 10,
    }),
  } as unknown as FfmpegRunner
}

describe('snapshot capture with FFmpeg fallback', () => {
  it('prefers the endpoint when it works', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-cap-'))
    const result = await captureSnapshot({
      cameraId: 'cam-1',
      libraryRoot: dir,
      snapshotUri: 'http://cam.local/snap.jpg',
      fetchImpl: async () => ({
        status: 200,
        ok: true,
        arrayBuffer: async () =>
          JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.byteLength),
      }),
    } as never)
    expect(result.source).toBe('endpoint')
  })

  it('falls back to FFmpeg when the endpoint fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-cap-'))
    const outputDir = mkdtempSync(join(tmpdir(), 'swc-frame-'))
    const outputFile = join(outputDir, 'frame.jpg')

    const result = await captureSnapshot({
      cameraId: 'cam-1',
      libraryRoot: dir,
      snapshotUri: 'http://cam.local/snap.jpg',
      rtspUrl: 'rtsp://cam.local/stream',
      outputDir,
      ffmpegRunner: fakeRunner(outputFile),
      fetchImpl: async () => ({
        status: 500,
        ok: false,
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    } as never)
    expect(result.source).toBe('ffmpeg')
  })

  it('does not fall back when the endpoint is absent and there is no RTSP URL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-cap-'))
    await expect(captureSnapshot({ cameraId: 'cam-1', libraryRoot: dir })).rejects.toBeTruthy()
  })

  it('reports an error when FFmpeg fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-cap-'))
    await expect(
      captureSnapshot({
        cameraId: 'cam-1',
        libraryRoot: dir,
        rtspUrl: 'rtsp://cam.local/stream',
        ffmpegRunner: failingRunner(),
      } as never),
    ).rejects.toThrow(/FFmpeg/)
  })
})
