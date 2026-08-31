import { fetchSnapshot, saveSnapshot, SnapshotError, type SnapshotSaveResult } from './snapshot.js'
import type { SnapshotFetchOptions } from './snapshot.js'
import type { FfmpegRunner } from '../../workers/media/ffmpeg-runner.js'

export interface SnapshotFallbackOptions {
  rtspUrl: string
  outputDir: string
  timeoutMs?: number
}

export interface SnapshotCaptureOptions {
  cameraId: string
  libraryRoot: string
  snapshotUri?: string | null
  rtspUrl?: string | null
  username?: string | null
  password?: string | null
  ffmpegBinary?: string
  outputDir?: string
  ffmpegRunner?: FfmpegRunner
  fetchImpl?: SnapshotFetchOptions['fetchImpl']
}

export interface SnapshotCaptureResult extends SnapshotSaveResult {
  source: 'endpoint' | 'ffmpeg'
}

export async function captureSnapshot(
  options: SnapshotCaptureOptions,
): Promise<SnapshotCaptureResult> {
  // Prefer the ONVIF/HTTP endpoint when available
  if (options.snapshotUri) {
    try {
      const buffer = await fetchSnapshot({
        url: options.snapshotUri,
        username: options.username,
        password: options.password,
        fetchImpl: options.fetchImpl,
      })
      const saved = await saveSnapshot(buffer, {
        cameraId: options.cameraId,
        libraryRoot: options.libraryRoot,
      })
      return { ...saved, source: 'endpoint' }
    } catch (error) {
      // fall back to frame extraction only if the endpoint failed
      if (!options.rtspUrl) throw error
    }
  }

  if (!options.rtspUrl) {
    throw new SnapshotError('Nenhum endpoint de snapshot disponível.', 'FETCH_FAILED')
  }

  const saved = await captureFrameFromStream({
    cameraId: options.cameraId,
    libraryRoot: options.libraryRoot,
    rtspUrl: options.rtspUrl,
    outputDir: options.outputDir,
    ffmpegBinary: options.ffmpegBinary,
    ffmpegRunner: options.ffmpegRunner,
  })
  return { ...saved, source: 'ffmpeg' }
}

async function captureFrameFromStream(options: {
  cameraId: string
  libraryRoot: string
  rtspUrl: string
  outputDir?: string
  ffmpegBinary?: string
  ffmpegRunner?: FfmpegRunner
}): Promise<SnapshotSaveResult> {
  const { FfmpegRunner } = await import('../../workers/media/ffmpeg-runner.js')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const runner = options.ffmpegRunner ?? new FfmpegRunner(options.ffmpegBinary ?? 'ffmpeg')
  const outputDir = options.outputDir ?? mkdtempSync(join(tmpdir(), 'swc-frame-'))

  const outputPath = join(outputDir, 'frame.jpg')
  const result = await runner.run({
    binaryPath: options.ffmpegBinary ?? 'ffmpeg',
    args: ['-i', options.rtspUrl, '-frames:v', '1', '-q:v', '2', '-y', outputPath],
    allowedOutputDirs: [outputDir],
    timeoutMs: 10_000,
  })

  if (result.exitCode !== 0 || result.timedOut) {
    throw new SnapshotError('Falha ao capturar frame via FFmpeg.', 'FETCH_FAILED')
  }

  const { readFile } = await import('node:fs/promises')
  const buffer = await readFile(outputPath)
  if (buffer.byteLength === 0) {
    throw new SnapshotError('Frame capturado está vazio.', 'FETCH_FAILED')
  }

  return saveSnapshot(buffer, { cameraId: options.cameraId, libraryRoot: options.libraryRoot })
}
