import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  CameraEndpoint,
  CameraProfile,
  CameraRecord,
  DiagnosticRecord,
  EncryptedCredential,
  RecordingRecord,
  RecordingSegmentRecord,
  SnapshotRecord,
} from '../../shared/database.js'

type Row = Record<string, unknown>

function nowIso(): string {
  return new Date().toISOString()
}

function mapCamera(row: Row): CameraRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    host: row.host as string,
    port: (row.port as number) ?? null,
    manufacturer: (row.manufacturer as string) ?? null,
    model: (row.model as string) ?? null,
    serialNumber: (row.serial_number as string) ?? null,
    epr: (row.epr as string) ?? null,
    status: row.status as CameraRecord['status'],
    recordingStatus: row.recording_status as CameraRecord['recordingStatus'],
    supportsPtz: Boolean(row.supports_ptz),
    active: Boolean(row.active),
    endpoints: [],
  }
}

function mapProfile(row: Row): CameraProfile {
  return {
    id: row.id as string,
    cameraId: row.camera_id as string,
    token: row.token as string,
    name: (row.name as string) ?? null,
    streamType: row.stream_type as CameraProfile['streamType'],
    codec: (row.codec as string) ?? null,
    width: (row.width as number) ?? null,
    height: (row.height as number) ?? null,
    fps: (row.fps as number) ?? null,
    active: Boolean(row.active),
  }
}

function mapRecording(row: Row): RecordingRecord {
  return {
    id: row.id as string,
    cameraId: row.camera_id as string,
    status: row.status as RecordingRecord['status'],
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) ?? null,
    durationMs: (row.duration_ms as number) ?? null,
  }
}

function mapSnapshot(row: Row): SnapshotRecord {
  return {
    id: row.id as string,
    cameraId: row.camera_id as string,
    path: row.path as string,
    capturedAt: row.captured_at as string,
  }
}

function mapDiagnostic(row: Row): DiagnosticRecord {
  return {
    id: row.id as number,
    cameraId: (row.camera_id as string) ?? null,
    code: row.code as string,
    message: row.message as string,
    count: row.count as number,
    firstSeen: row.first_seen as string,
    lastSeen: row.last_seen as string,
  }
}

export class CameraRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    name: string
    host: string
    port?: number | null
    manufacturer?: string | null
    model?: string | null
    serialNumber?: string | null
    epr?: string | null
    endpoints?: CameraEndpoint[]
  }): CameraRecord {
    const id = randomUUID()
    const ts = nowIso()
    const insert = this.db.prepare(
      `INSERT INTO cameras (id, name, host, port, manufacturer, model, serial_number, epr, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insert.run(
      id,
      input.name,
      input.host,
      input.port ?? null,
      input.manufacturer ?? null,
      input.model ?? null,
      input.serialNumber ?? null,
      input.epr ?? null,
      ts,
      ts,
    )

    const replaceEndpoints = this.db.prepare(
      `INSERT OR REPLACE INTO camera_endpoints (camera_id, service, url) VALUES (?, ?, ?)`,
    )
    const insertEndpoint = this.db.transaction((endpoints: CameraEndpoint[]) => {
      for (const ep of endpoints) replaceEndpoints.run(id, ep.service, ep.url)
    })
    insertEndpoint(input.endpoints ?? [])

    return this.getById(id) as CameraRecord
  }

  getById(id: string): CameraRecord | null {
    const row = this.db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) as Row | undefined
    if (!row) return null
    const record = mapCamera(row)
    record.endpoints = this.listEndpoints(id)
    return record
  }

  listEndpoints(cameraId: string): CameraEndpoint[] {
    const rows = this.db
      .prepare('SELECT service, url FROM camera_endpoints WHERE camera_id = ?')
      .all(cameraId) as Row[]
    return rows.map((r) => ({
      service: r.service as CameraEndpoint['service'],
      url: r.url as string,
    }))
  }

  setEndpoint(cameraId: string, endpoint: CameraEndpoint): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO camera_endpoints (camera_id, service, url) VALUES (?, ?, ?)',
      )
      .run(cameraId, endpoint.service, endpoint.url)
  }

  list(includeInactive = false): CameraRecord[] {
    const rows = (
      includeInactive
        ? this.db.prepare('SELECT * FROM cameras ORDER BY name').all()
        : this.db.prepare('SELECT * FROM cameras WHERE active = 1 ORDER BY name').all()
    ) as Row[]
    return rows.map((row) => {
      const record = mapCamera(row)
      record.endpoints = this.listEndpoints(record.id)
      return record
    })
  }

  update(
    id: string,
    fields: Partial<{ name: string; host: string; port: number | null }>,
  ): CameraRecord | null {
    if (!this.getById(id)) return null
    const existing = this.db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) as Row
    this.db
      .prepare(`UPDATE cameras SET name = ?, host = ?, port = ?, updated_at = ? WHERE id = ?`)
      .run(
        fields.name ?? (existing.name as string),
        fields.host ?? (existing.host as string),
        fields.port !== undefined ? fields.port : (existing.port as number | null),
        nowIso(),
        id,
      )
    return this.getById(id)
  }

  setStatus(id: string, status: CameraRecord['status']): void {
    this.db
      .prepare('UPDATE cameras SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(), id)
  }

  setRecordingStatus(id: string, status: CameraRecord['recordingStatus']): void {
    this.db
      .prepare('UPDATE cameras SET recording_status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(), id)
  }

  setSupportsPtz(id: string, supportsPtz: boolean): void {
    this.db
      .prepare('UPDATE cameras SET supports_ptz = ?, updated_at = ? WHERE id = ?')
      .run(supportsPtz ? 1 : 0, nowIso(), id)
  }

  deactivate(id: string): boolean {
    const result = this.db
      .prepare('UPDATE cameras SET active = 0, updated_at = ? WHERE id = ? AND active = 1')
      .run(nowIso(), id)
    return result.changes > 0
  }

  activate(id: string): boolean {
    const result = this.db
      .prepare('UPDATE cameras SET active = 1, updated_at = ? WHERE id = ? AND active = 0')
      .run(nowIso(), id)
    return result.changes > 0
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM cameras WHERE id = ?').run(id)
    return result.changes > 0
  }

  findBySerialNumber(serialNumber: string): CameraRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM cameras WHERE serial_number = ? AND serial_number IS NOT NULL LIMIT 1',
      )
      .get(serialNumber) as Row | undefined
    if (!row) return null
    const record = mapCamera(row)
    record.endpoints = this.listEndpoints(record.id)
    return record
  }

  findByEpr(epr: string): CameraRecord | null {
    const row = this.db
      .prepare('SELECT * FROM cameras WHERE epr = ? AND epr IS NOT NULL LIMIT 1')
      .get(epr) as Row | undefined
    if (!row) return null
    const record = mapCamera(row)
    record.endpoints = this.listEndpoints(record.id)
    return record
  }

  findByHost(host: string): CameraRecord | null {
    const row = this.db.prepare('SELECT * FROM cameras WHERE host = ? LIMIT 1').get(host) as
      Row | undefined
    if (!row) return null
    const record = mapCamera(row)
    record.endpoints = this.listEndpoints(record.id)
    return record
  }

  setIdentity(
    id: string,
    fields: Partial<{ manufacturer: string; model: string; serialNumber: string; epr: string }>,
  ): void {
    const existing = this.db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) as
      Row | undefined
    if (!existing) return
    this.db
      .prepare(
        `UPDATE cameras SET manufacturer = ?, model = ?, serial_number = ?, epr = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        fields.manufacturer ?? (existing.manufacturer as string) ?? null,
        fields.model ?? (existing.model as string) ?? null,
        fields.serialNumber ?? (existing.serial_number as string) ?? null,
        fields.epr ?? (existing.epr as string) ?? null,
        nowIso(),
        id,
      )
  }
}

export class CapabilityRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(
    cameraId: string,
    caps: Partial<{
      onvif: boolean
      rtsp: boolean
      snapshot: boolean
      ptz: boolean
      h264: boolean
      h265: boolean
      mjpeg: boolean
    }>,
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO camera_capabilities
         (camera_id, onvif, rtsp, snapshot, ptz, h264, h265, mjpeg, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cameraId,
        caps.onvif ? 1 : 0,
        caps.rtsp ? 1 : 0,
        caps.snapshot ? 1 : 0,
        caps.ptz ? 1 : 0,
        caps.h264 ? 1 : 0,
        caps.h265 ? 1 : 0,
        caps.mjpeg ? 1 : 0,
        nowIso(),
      )
  }

  get(cameraId: string): {
    onvif: boolean
    rtsp: boolean
    snapshot: boolean
    ptz: boolean
    h264: boolean
    h265: boolean
    mjpeg: boolean
  } | null {
    const row = this.db
      .prepare('SELECT * FROM camera_capabilities WHERE camera_id = ?')
      .get(cameraId) as Row | undefined
    if (!row) return null
    return {
      onvif: Boolean(row.onvif),
      rtsp: Boolean(row.rtsp),
      snapshot: Boolean(row.snapshot),
      ptz: Boolean(row.ptz),
      h264: Boolean(row.h264),
      h265: Boolean(row.h265),
      mjpeg: Boolean(row.mjpeg),
    }
  }
}

export class CredentialRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(cameraId: string, service: string, credential: EncryptedCredential): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO camera_credentials (camera_id, service, key_version, ciphertext, nonce, tag, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cameraId,
        service,
        credential.keyVersion,
        credential.ciphertext,
        credential.nonce,
        credential.tag,
        nowIso(),
      )
  }

  get(cameraId: string, service: string): EncryptedCredential | null {
    const row = this.db
      .prepare(
        'SELECT key_version, ciphertext, nonce, tag FROM camera_credentials WHERE camera_id = ? AND service = ?',
      )
      .get(cameraId, service) as Row | undefined
    if (!row) return null
    return {
      keyVersion: row.key_version as number,
      ciphertext: row.ciphertext as string,
      nonce: row.nonce as string,
      tag: row.tag as string,
    }
  }

  hasCredential(cameraId: string): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM camera_credentials WHERE camera_id = ?')
      .get(cameraId) as Row
    return Number(row.n) > 0
  }

  listServices(cameraId: string): string[] {
    const rows = this.db
      .prepare('SELECT service FROM camera_credentials WHERE camera_id = ? ORDER BY service')
      .all(cameraId) as Row[]
    return rows.map((r) => r.service as string)
  }

  remove(cameraId: string, service?: string): void {
    if (service) {
      this.db
        .prepare('DELETE FROM camera_credentials WHERE camera_id = ? AND service = ?')
        .run(cameraId, service)
    } else {
      this.db.prepare('DELETE FROM camera_credentials WHERE camera_id = ?').run(cameraId)
    }
  }
}

export class ProfileRepository {
  constructor(private readonly db: Database.Database) {}

  replaceAll(
    cameraId: string,
    profiles: Omit<CameraProfile, 'id' | 'cameraId' | 'active'>[],
  ): CameraProfile[] {
    const remove = this.db.prepare('DELETE FROM camera_profiles WHERE camera_id = ?')
    const insert = this.db.prepare(
      `INSERT INTO camera_profiles (id, camera_id, token, name, stream_type, codec, width, height, fps, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    const tx = this.db.transaction((items: typeof profiles) => {
      remove.run(cameraId)
      for (const p of items) {
        insert.run(
          randomUUID(),
          cameraId,
          p.token,
          p.name,
          p.streamType,
          p.codec,
          p.width,
          p.height,
          p.fps,
          nowIso(),
        )
      }
    })
    tx(profiles)
    return this.list(cameraId)
  }

  list(cameraId: string): CameraProfile[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM camera_profiles WHERE camera_id = ? AND active = 1 ORDER BY stream_type',
      )
      .all(cameraId) as Row[]
    return rows.map(mapProfile)
  }
}

export class RecordingRepository {
  constructor(private readonly db: Database.Database) {}

  create(cameraId: string): RecordingRecord {
    const id = randomUUID()
    const ts = nowIso()
    this.db
      .prepare(
        `INSERT INTO recordings (id, camera_id, status, started_at, created_at, updated_at) VALUES (?, ?, 'starting', ?, ?, ?)`,
      )
      .run(id, cameraId, ts, ts, ts)
    return this.getById(id) as RecordingRecord
  }

  getById(id: string): RecordingRecord | null {
    const row = this.db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Row | undefined
    return row ? mapRecording(row) : null
  }

  complete(id: string, status: RecordingRecord['status']): RecordingRecord | null {
    const endedAt = nowIso()
    const start = this.db.prepare('SELECT started_at FROM recordings WHERE id = ?').get(id) as
      Row | undefined
    if (!start) return null
    const durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(start.started_at as string))
    this.db
      .prepare(
        'UPDATE recordings SET status = ?, ended_at = ?, duration_ms = ?, updated_at = ? WHERE id = ?',
      )
      .run(status, endedAt, durationMs, endedAt, id)
    return this.getById(id)
  }

  list(cameraId: string): RecordingRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM recordings WHERE camera_id = ? ORDER BY started_at DESC')
      .all(cameraId) as Row[]
    return rows.map(mapRecording)
  }

  addSegment(input: {
    recordingId: string
    path: string
    startedAt: string
    endedAt?: string | null
    durationMs?: number | null
    status?: RecordingSegmentRecord['status']
  }): RecordingSegmentRecord {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO recording_segments
         (id, recording_id, path, started_at, ended_at, duration_ms, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.recordingId,
        input.path,
        input.startedAt,
        input.endedAt ?? null,
        input.durationMs ?? null,
        input.status ?? 'completed',
      )
    return {
      id,
      recordingId: input.recordingId,
      path: input.path,
      startedAt: input.startedAt,
      endedAt: input.endedAt ?? null,
      durationMs: input.durationMs ?? null,
      status: input.status ?? 'completed',
    }
  }

  listSegments(recordingId: string): RecordingSegmentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, recording_id, path, started_at, ended_at, duration_ms, status
         FROM recording_segments WHERE recording_id = ? ORDER BY started_at`,
      )
      .all(recordingId) as Row[]
    return rows.map((row) => ({
      id: row.id as string,
      recordingId: row.recording_id as string,
      path: row.path as string,
      startedAt: row.started_at as string,
      endedAt: (row.ended_at as string) ?? null,
      durationMs: (row.duration_ms as number) ?? null,
      status: row.status as RecordingSegmentRecord['status'],
    }))
  }
}

export class SnapshotRepository {
  constructor(private readonly db: Database.Database) {}

  create(cameraId: string, path: string): SnapshotRecord {
    const id = randomUUID()
    const capturedAt = nowIso()
    this.db
      .prepare('INSERT INTO snapshots (id, camera_id, path, captured_at) VALUES (?, ?, ?, ?)')
      .run(id, cameraId, path, capturedAt)
    return { id, cameraId, path, capturedAt }
  }

  list(cameraId: string): SnapshotRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM snapshots WHERE camera_id = ? ORDER BY captured_at DESC')
      .all(cameraId) as Row[]
    return rows.map(mapSnapshot)
  }
}

export class PreferenceRepository {
  constructor(private readonly db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as
      Row | undefined
    return row ? (row.value as string) : null
  }

  set(key: string, value: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO preferences (key, value, updated_at) VALUES (?, ?, ?)')
      .run(key, value, nowIso())
  }
}

export class DiagnosticRepository {
  constructor(private readonly db: Database.Database) {}

  append(input: {
    cameraId?: string | null
    code: string
    message: string
    fingerprint: string
  }): DiagnosticRecord {
    const ts = nowIso()
    const existing = this.db
      .prepare('SELECT id, count FROM diagnostics WHERE fingerprint = ?')
      .get(input.fingerprint) as Row | undefined

    if (existing) {
      this.db
        .prepare('UPDATE diagnostics SET count = count + 1, last_seen = ? WHERE id = ?')
        .run(ts, existing.id)
      return this.getById(existing.id as number) as DiagnosticRecord
    }

    this.db
      .prepare(
        `INSERT INTO diagnostics (camera_id, code, message, count, first_seen, last_seen, fingerprint)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(input.cameraId ?? null, input.code, input.message, ts, ts, input.fingerprint)
    const row = this.db
      .prepare('SELECT id FROM diagnostics WHERE fingerprint = ?')
      .get(input.fingerprint) as Row
    return this.getById(row.id as number) as DiagnosticRecord
  }

  getById(id: number): DiagnosticRecord | null {
    const row = this.db.prepare('SELECT * FROM diagnostics WHERE id = ?').get(id) as Row | undefined
    return row ? mapDiagnostic(row) : null
  }

  list(limit = 100): DiagnosticRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM diagnostics ORDER BY last_seen DESC LIMIT ?')
      .all(limit) as Row[]
    return rows.map(mapDiagnostic)
  }
}
