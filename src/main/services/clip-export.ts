import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { RecordingSegmentRecord } from '../../shared/database.js'
import type { FfmpegRunResult } from '../../workers/media/ffmpeg-runner.js'

export const MAX_CLIP_EXPORT_DURATION_MS = 2 * 60 * 60 * 1_000
export const CLIP_EXPORT_TIMEOUT_MS = 10 * 60 * 1_000

export interface ClipExportExecutor {
  run(input: {
    binaryPath: string
    args: string[]
    allowedOutputDirs: string[]
    allowedInputDirs: string[]
    timeoutMs: number
    signal: AbortSignal
    onProgress: (positionMs: number) => void
  }): Promise<FfmpegRunResult>
}

export interface ClipExportInput {
  recordingId: string
  jobId?: string
  segments: Array<RecordingSegmentRecord & { absolutePath: string }>
  startAt: string
  endAt: string
  destinationPath: string
}

export interface ClipExportResult {
  jobId: string
  destinationPath: string
  durationMs: number
  gaps: Array<{ startsAt: string; endsAt: string }>
}

export interface ClipExportStatus {
  active: boolean
  percent: number
}

interface PlannedSegment {
  path: string
  inpointSeconds: number
  outpointSeconds: number
  startedAt: string
  endedAt: string
}

function asTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`${label} inválido.`)
  return timestamp
}

function escapeConcatPath(path: string): string {
  // FFmpeg's concat demuxer uses single-quoted paths. Keep this escaping local
  // and never construct a shell command.
  return path.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

export function planClipExport(input: ClipExportInput): {
  durationMs: number
  segments: PlannedSegment[]
  gaps: Array<{ startsAt: string; endsAt: string }>
} {
  const startMs = asTimestamp(input.startAt, 'Início')
  const endMs = asTimestamp(input.endAt, 'Fim')
  const durationMs = endMs - startMs
  if (durationMs <= 0) throw new Error('O fim deve ser posterior ao início.')
  if (durationMs > MAX_CLIP_EXPORT_DURATION_MS) {
    throw new Error('O trecho excede a duração máxima de 2 horas.')
  }

  const source = [...input.segments]
    .filter((segment) => segment.endedAt !== null)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const segments: PlannedSegment[] = []
  const gaps: Array<{ startsAt: string; endsAt: string }> = []
  let coveredUntil = startMs

  for (const segment of source) {
    const segmentStart = asTimestamp(segment.startedAt, 'Início do segmento')
    const segmentEnd = asTimestamp(segment.endedAt!, 'Fim do segmento')
    if (segmentEnd <= startMs || segmentStart >= endMs || segmentEnd <= segmentStart)
      continue
    const overlapStart = Math.max(startMs, segmentStart, coveredUntil)
    const overlapEnd = Math.min(endMs, segmentEnd)
    if (overlapEnd <= overlapStart) continue
    if (overlapStart > coveredUntil) {
      gaps.push({
        startsAt: new Date(coveredUntil).toISOString(),
        endsAt: new Date(overlapStart).toISOString(),
      })
    }
    segments.push({
      path: segment.absolutePath,
      inpointSeconds: (overlapStart - segmentStart) / 1_000,
      outpointSeconds: (overlapEnd - segmentStart) / 1_000,
      startedAt: new Date(overlapStart).toISOString(),
      endedAt: new Date(overlapEnd).toISOString(),
    })
    coveredUntil = Math.max(coveredUntil, overlapEnd)
  }
  if (coveredUntil < endMs) {
    gaps.push({
      startsAt: new Date(coveredUntil).toISOString(),
      endsAt: new Date(endMs).toISOString(),
    })
  }
  if (segments.length === 0) throw new Error('Não há vídeo disponível no período selecionado.')
  return { durationMs, segments, gaps }
}

export function buildConcatManifest(segments: PlannedSegment[]): string {
  return segments
    .flatMap((segment) => [
      `file '${escapeConcatPath(segment.path)}'`,
      `inpoint ${segment.inpointSeconds.toFixed(3)}`,
      `outpoint ${segment.outpointSeconds.toFixed(3)}`,
    ])
    .join('\n')
    .concat('\n')
}

export class ClipExportService {
  private active: { id: string; recordingId: string; controller: AbortController; percent: number } | null = null

  constructor(
    private readonly executor: ClipExportExecutor,
    private readonly binaryPath: string,
    private readonly temporaryRoot: string,
  ) {}

  get activeJobId(): string | null {
    return this.active?.id ?? null
  }

  cancel(jobId: string): boolean {
    if (!this.active || this.active.id !== jobId) return false
    this.active.controller.abort()
    return true
  }

  status(jobId: string): ClipExportStatus {
    if (!this.active || this.active.id !== jobId) return { active: false, percent: 0 }
    return { active: true, percent: this.active.percent }
  }

  isUsingRecording(recordingId: string): boolean {
    return this.active?.recordingId === recordingId
  }

  async export(input: ClipExportInput, onProgress: (percent: number) => void = () => undefined): Promise<ClipExportResult> {
    if (this.active) throw new Error('Já existe uma exportação em andamento.')
    const plan = planClipExport(input)
    const id = input.jobId ?? randomUUID()
    const controller = new AbortController()
    this.active = { id, recordingId: input.recordingId, controller, percent: 0 }
    await mkdir(this.temporaryRoot, { recursive: true })
    const temporaryDir = await mkdtemp(join(this.temporaryRoot, 'clip-'))
    try {
      const manifestPath = join(temporaryDir, 'segments.ffconcat')
      await writeFile(manifestPath, buildConcatManifest(plan.segments), 'utf8')
      const result = await this.executor.run({
        binaryPath: this.binaryPath,
        args: [
          '-hide_banner', '-nostdin', '-y', '-f', 'concat', '-safe', '0',
          '-i', manifestPath, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy',
          '-movflags', '+faststart', input.destinationPath,
        ],
        allowedOutputDirs: [dirname(resolve(input.destinationPath)), temporaryDir],
        allowedInputDirs: [temporaryDir, ...plan.segments.map((segment) => dirname(segment.path))],
        timeoutMs: CLIP_EXPORT_TIMEOUT_MS,
        signal: controller.signal,
        onProgress: (positionMs) => {
          const percent = Math.min(100, Math.round((positionMs / plan.durationMs) * 100))
          if (this.active?.id === id) this.active.percent = percent
          onProgress(percent)
        },
      })
      if (result.exitCode !== 0) throw new Error('FFmpeg não conseguiu gerar o trecho solicitado.')
      const output = await stat(input.destinationPath)
      if (!output.isFile() || output.size === 0) throw new Error('O arquivo exportado está vazio.')
      return { jobId: id, destinationPath: input.destinationPath, durationMs: plan.durationMs, gaps: plan.gaps }
    } finally {
      if (this.active?.id === id) this.active = null
      await rm(temporaryDir, { recursive: true, force: true })
    }
  }
}
