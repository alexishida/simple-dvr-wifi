import { randomUUID } from 'node:crypto'
import { join, resolve, relative } from 'node:path'
import type { DatabaseSupervisor } from '../supervisors/database.js'
import { checkStorageStatus, shouldAllowWrite, type StorageStatus } from './storage-monitor.js'
import type { RecordingRecord } from '../../shared/database.js'

export type RecordingSegmentStatus =
  'starting' | 'recording' | 'stopping' | 'completed' | 'interrupted' | 'failed'

export interface RecordingSegment {
  id: string
  recordingId: string
  cameraId: string
  path: string
  startedAt: string
  endedAt: string | null
  durationMs: number | null
  status: RecordingSegmentStatus
}

export interface RecordingSessionState {
  recordingId: string
  cameraId: string
  status: RecordingRecord['status']
  startedAt: string
  segments: RecordingSegment[]
  rpoMs: number
  storage: StorageStatus | null
  writeAllowed: boolean
}

export interface RecordingCatalogOptions {
  cameraId: string
  libraryRoot: string
  segmentDurationMs?: number
  minFreeBytes?: number
  rpoMs?: number
}

export class RecordingCatalogService {
  private readonly sessions = new Map<string, RecordingSessionState>()
  private readonly segmentDurationMs: number
  private readonly minFreeBytes: number
  private readonly rpoMs: number

  constructor(
    private readonly database: DatabaseSupervisor,
    private readonly options: RecordingCatalogOptions,
  ) {
    this.segmentDurationMs = options.segmentDurationMs ?? 1_000
    this.minFreeBytes = options.minFreeBytes ?? 256 * 1024 * 1024
    this.rpoMs = options.rpoMs ?? 3_000
  }

  get activeSessions(): string[] {
    return [...this.sessions.keys()]
  }

  sessionState(cameraId: string): RecordingSessionState | null {
    return this.sessions.get(cameraId) ?? null
  }

  private async checkStorage(): Promise<StorageStatus> {
    return checkStorageStatus(this.options.libraryRoot, { minFreeBytes: this.minFreeBytes })
  }

  async start(cameraId: string): Promise<RecordingSessionState> {
    const existing = this.sessions.get(cameraId)
    if (existing) return existing

    const storage = await this.checkStorage()
    if (!shouldAllowWrite(storage)) {
      return {
        recordingId: '',
        cameraId,
        status: 'failed',
        startedAt: '',
        segments: [],
        rpoMs: this.rpoMs,
        storage,
        writeAllowed: false,
      }
    }

    const response = await this.database.request('recording.create', { cameraId })
    if (!response.ok) {
      throw new Error('Não foi possível iniciar a gravação.')
    }
    const recording = response.value as RecordingRecord

    const state: RecordingSessionState = {
      recordingId: recording.id,
      cameraId,
      status: 'recording',
      startedAt: recording.startedAt,
      segments: [],
      rpoMs: this.rpoMs,
      storage,
      writeAllowed: true,
    }
    this.sessions.set(cameraId, state)

    // open first segment
    await this.openSegment(state)
    return state
  }

  private async openSegment(state: RecordingSessionState): Promise<RecordingSegment> {
    const now = new Date().toISOString()
    const segment: RecordingSegment = {
      id: randomUUID(),
      recordingId: state.recordingId,
      cameraId: state.cameraId,
      path: this.segmentPath(state.cameraId, now),
      startedAt: now,
      endedAt: null,
      durationMs: null,
      status: 'recording',
    }
    state.segments.push(segment)
    return segment
  }

  private segmentPath(cameraId: string, startedAt: string): string {
    const date = startedAt.slice(0, 10)
    const relativePath = join('recordings', cameraId, date, `${randomUUID()}.m4s`)
    const absolute = resolve(this.options.libraryRoot, relativePath)
    const fromRoot = relative(this.options.libraryRoot, absolute)
    if (fromRoot.startsWith('..') || fromRoot.includes(':')) {
      throw new Error('Caminho de segmento fora da biblioteca.')
    }
    return absolute
  }

  async rotateSegment(cameraId: string): Promise<void> {
    const state = this.sessions.get(cameraId)
    if (!state) return

    const last = state.segments[state.segments.length - 1]
    if (last && last.status === 'recording') {
      last.endedAt = new Date().toISOString()
      last.durationMs = Math.max(0, Date.parse(last.endedAt) - Date.parse(last.startedAt))
      last.status = 'completed'
    }
    await this.openSegment(state)
  }

  async stop(cameraId: string): Promise<void> {
    const state = this.sessions.get(cameraId)
    if (!state) return

    const last = state.segments[state.segments.length - 1]
    if (last && last.status === 'recording') {
      last.endedAt = new Date().toISOString()
      last.durationMs = Math.max(0, Date.parse(last.endedAt) - Date.parse(last.startedAt))
      last.status = 'completed'
    }

    await this.database.request('recording.complete', {
      id: state.recordingId,
      status: 'completed',
    })

    state.status = 'completed'
    this.sessions.delete(cameraId)
  }

  async markInterrupted(
    cameraId: string,
    reason: 'camera_drop' | 'sidecar_crash' | 'storage_full' | 'app_quit',
  ): Promise<void> {
    const state = this.sessions.get(cameraId)
    if (!state) return

    const last = state.segments[state.segments.length - 1]
    if (last && last.status === 'recording') {
      last.endedAt = new Date().toISOString()
      last.durationMs = Math.max(0, Date.parse(last.endedAt) - Date.parse(last.startedAt))
      last.status = reason === 'storage_full' ? 'failed' : 'interrupted'
    }

    await this.database.request('recording.complete', {
      id: state.recordingId,
      status: reason === 'storage_full' ? 'failed' : 'interrupted',
    })

    state.status = reason === 'storage_full' ? 'failed' : 'interrupted'
    this.sessions.delete(cameraId)
  }

  async flushAll(): Promise<number> {
    const ids = [...this.sessions.keys()]
    await Promise.all(ids.map((id) => this.stop(id)))
    return ids.length
  }

  // Recovery: after a crash, only the last part within the RPO may be lost.
  async recoverIncomplete(cameraId: string): Promise<void> {
    const state = this.sessions.get(cameraId)
    if (state) {
      await this.markInterrupted(cameraId, 'app_quit')
    }
  }
}
