import type Database from "better-sqlite3";
import DatabaseConstructor from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  CameraRecord,
  DbRequest,
  DbResponse,
} from "../../shared/database.js";
import { MediaMetadataInputSchema } from "../../shared/database.js";
import { SchedulePeriodSchema } from "../../shared/recording-schedule.js";
import {
  CameraRepository,
  CapabilityRepository,
  CredentialRepository,
  MediaMetadataRepository,
  PreferenceRepository,
  ProfileRepository,
  RecordingRepository,
  SnapshotRepository,
} from "./repositories.js";
import { integrityCheck, runMigrations, type Migration } from "./migrations.js";

type RepositoryBag = {
  cameras: CameraRepository;
  capabilities: CapabilityRepository;
  credentials: CredentialRepository;
  profiles: ProfileRepository;
  recordings: RecordingRepository;
  snapshots: SnapshotRepository;
  metadata: MediaMetadataRepository;
  preferences: PreferenceRepository;
};

export class SqliteWorker {
  private db: Database.Database | null = null;
  private repos: RepositoryBag | null = null;

  constructor(private readonly migrations: Migration[] = []) {}

  get database(): Database.Database | null {
    return this.db;
  }

  isReady(): boolean {
    return this.db !== null && this.repos !== null;
  }

  open(dbPath: string, backupDir?: string): void {
    if (this.db) throw new Error("Worker já inicializado.");
    const db = new DatabaseConstructor(dbPath) as Database.Database;
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      runMigrations(db, { dbPath, backupDir }, this.migrations);
    } catch (error) {
      db.close();
      throw error;
    }
    this.db = db;
    this.repos = {
      cameras: new CameraRepository(db),
      capabilities: new CapabilityRepository(db),
      credentials: new CredentialRepository(db),
      profiles: new ProfileRepository(db),
      recordings: new RecordingRepository(db),
      snapshots: new SnapshotRepository(db),
      metadata: new MediaMetadataRepository(db),
      preferences: new PreferenceRepository(db),
    };
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.repos = null;
  }

  private backupPreview(db: Database.Database): {
    cameras: number; recordings: number; snapshots: number; schedules: number
    hasConfiguration: boolean; credentialsExcluded: boolean
  } {
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
        .map(({ name }) => name),
    );
    for (const table of ["cameras", "recordings", "snapshots", "preferences", "schema_migrations"]) {
      if (!tables.has(table)) throw new Error("O backup não possui o catálogo esperado.");
    }
    if (!integrityCheck(db).ok) throw new Error("A verificação de integridade do backup falhou.");
    const count = (table: string): number => Number(
      (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
    );
    return {
      cameras: count("cameras"),
      recordings: count("recordings"),
      snapshots: count("snapshots"),
      schedules: tables.has("recording_schedules") ? count("recording_schedules") : 0,
      hasConfiguration: Boolean(db.prepare("SELECT 1 FROM preferences WHERE key = 'app.config'").get()),
      credentialsExcluded: !tables.has("camera_credentials") || count("camera_credentials") === 0,
    };
  }

  async dispatch(request: DbRequest): Promise<DbResponse> {
    const reply = (value: unknown): DbResponse => ({
      id: request.id,
      ok: true,
      value,
    });
    const error = (
      code: DbResponse extends never
        ? never
        : | "VALIDATION_ERROR"
          | "NOT_FOUND"
          | "AUTH_ERROR"
          | "NETWORK_ERROR"
          | "MEDIA_ERROR"
          | "CODEC_ERROR"
          | "STORAGE_ERROR"
          | "INTERNAL_ERROR",
      message: string,
    ): DbResponse => ({
      id: request.id,
      ok: false,
      error: { code, message, retryable: false },
    });

    switch (request.op) {
      case "health":
        return reply({ ready: this.isReady() });
      case "integrity": {
        if (!this.db) return error("STORAGE_ERROR", "Banco não inicializado.");
        return reply(integrityCheck(this.db));
      }
      case "open": {
        const payload = request.payload as
          { dbPath?: string; backupDir?: string } | undefined;
        if (!payload?.dbPath)
          return error("VALIDATION_ERROR", "dbPath obrigatório.");
        this.open(payload.dbPath, payload.backupDir);
        return reply({ ready: true });
      }
      case "backup.export": {
        if (!this.db) return error("STORAGE_ERROR", "Banco não inicializado.");
        const payload = request.payload as { destination: string } | undefined;
        if (!payload?.destination)
          return error("VALIDATION_ERROR", "destination obrigatório.");
        await this.db.backup(payload.destination);
        const exported = new DatabaseConstructor(payload.destination) as Database.Database;
        let exportFailed = false;
        try {
          exported.pragma("foreign_keys = ON");
          exported.prepare("DELETE FROM camera_credentials").run();
          // Deleting the rows alone leaves ciphertext in free SQLite pages.
          // Rebuild the export so credentials cannot be recovered from it.
          exported.exec("VACUUM");
          return reply(this.backupPreview(exported));
        } catch (exportError) {
          exportFailed = true;
          throw exportError;
        } finally {
          exported.close();
          if (exportFailed) await rm(payload.destination, { force: true });
        }
      }
      case "backup.inspect": {
        const payload = request.payload as { source: string } | undefined;
        if (!payload?.source)
          return error("VALIDATION_ERROR", "source obrigatório.");
        const source = new DatabaseConstructor(payload.source, {
          readonly: true,
          fileMustExist: true,
        }) as Database.Database;
        try {
          return reply(this.backupPreview(source));
        } finally {
          source.close();
        }
      }
      case "backup.restore": {
        if (!this.db) return error("STORAGE_ERROR", "Banco não inicializado.");
        const payload = request.payload as
          | { source: string; destination: string; backupDir: string }
          | undefined;
        if (!payload?.source || !payload.destination || !payload.backupDir) {
          return error("VALIDATION_ERROR", "Dados de restauração inválidos.");
        }
        const source = new DatabaseConstructor(payload.source, {
          readonly: true,
          fileMustExist: true,
        }) as Database.Database;
        let preview: ReturnType<SqliteWorker["backupPreview"]>;
        try {
          preview = this.backupPreview(source);
        } finally {
          source.close();
        }
        const preserved = join(
          payload.backupDir,
          `before-restore-${Date.now()}-${randomUUID()}.sqlite`,
        );
        await mkdir(dirname(preserved), { recursive: true });
        await this.db.backup(preserved);
        this.close();
        const displaced = `${payload.destination}.restore-${randomUUID()}`;
        try {
          await rm(`${payload.destination}-wal`, { force: true });
          await rm(`${payload.destination}-shm`, { force: true });
          await rename(payload.destination, displaced);
          await rename(payload.source, payload.destination);
          this.open(payload.destination, payload.backupDir);
          await rm(displaced, { force: true });
          return reply({ ...preview, preserved });
        } catch (restoreError) {
          this.close();
          await rm(payload.destination, { force: true });
          await rename(displaced, payload.destination).catch(() => undefined);
          this.open(payload.destination, payload.backupDir);
          throw restoreError;
        }
      }
      case "close":
        this.close();
        return reply(null);
    }

    if (!this.isReady() || !this.repos) {
      return error("STORAGE_ERROR", "Banco não inicializado.");
    }

    const r = this.repos;
    try {
      switch (request.op) {
        case "camera.create": {
          const p = request.payload as Parameters<
            CameraRepository["create"]
          >[0];
          return reply(r.cameras.create(p));
        }
        case "camera.get": {
          const p = request.payload as { id: string };
          const camera = r.cameras.getById(p.id);
          return camera
            ? reply(camera)
            : error("NOT_FOUND", "Câmera não encontrada.");
        }
        case "camera.list":
          return reply(r.cameras.list());
        case "camera.listAll":
          return reply(r.cameras.list(true));
        case "camera.update": {
          const p = request.payload as { id: string } & Parameters<
            CameraRepository["update"]
          >[1];
          const camera = r.cameras.update(p.id, p);
          return camera
            ? reply(camera)
            : error("NOT_FOUND", "Câmera não encontrada.");
        }
        case "camera.deactivate": {
          const p = request.payload as { id: string };
          if (!r.cameras.deactivate(p.id)) {
            return error("NOT_FOUND", "Câmera não encontrada.");
          }
          r.cameras.setStatus(p.id, "disabled");
          return reply({ deactivated: true });
        }
        case "camera.activate": {
          const p = request.payload as { id: string };
          const camera = r.cameras.getById(p.id);
          if (!camera) return error("NOT_FOUND", "Câmera não encontrada.");
          r.cameras.activate(p.id);
          r.cameras.setStatus(p.id, "disconnected");
          return reply({ activated: true });
        }
        case "camera.remove": {
          const p = request.payload as { id: string };
          return r.cameras.remove(p.id)
            ? reply({ removed: true })
            : error("NOT_FOUND", "Câmera não encontrada.");
        }
        case "camera.findBySerial": {
          const p = request.payload as { serialNumber: string };
          const camera = r.cameras.findBySerialNumber(p.serialNumber);
          return camera ? reply(camera) : reply(null);
        }
        case "camera.findByEpr": {
          const p = request.payload as { epr: string };
          const camera = r.cameras.findByEpr(p.epr);
          return camera ? reply(camera) : reply(null);
        }
        case "camera.findByHost": {
          const p = request.payload as { host: string };
          const camera = r.cameras.findByHost(p.host);
          return camera ? reply(camera) : reply(null);
        }
        case "camera.setIdentity": {
          const p = request.payload as {
            cameraId: string;
            manufacturer?: string;
            model?: string;
            serialNumber?: string;
            epr?: string;
          };
          r.cameras.setIdentity(p.cameraId, p);
          return reply({ stored: true });
        }
        case "camera.setCapabilities": {
          const p = request.payload as { cameraId: string } & Record<
            string,
            unknown
          >;
          r.capabilities.upsert(
            p.cameraId,
            p as Parameters<CapabilityRepository["upsert"]>[1],
          );
          if (typeof p.ptz === "boolean")
            r.cameras.setSupportsPtz(p.cameraId, p.ptz);
          return reply({ stored: true });
        }
        case "camera.setEndpoint": {
          const p = request.payload as {
            cameraId: string;
            service: "onvif" | "rtsp" | "rtsp_sub" | "snapshot" | "ptz";
            url: string;
          };
          r.cameras.setEndpoint(p.cameraId, { service: p.service, url: p.url });
          return reply({ stored: true });
        }
        case "camera.setStatus": {
          const p = request.payload as {
            cameraId: string;
            status: CameraRecord["status"];
          };
          r.cameras.setStatus(p.cameraId, p.status);
          return reply({ stored: true });
        }
        case "camera.setRecordingStatus": {
          const p = request.payload as {
            cameraId: string;
            status: CameraRecord["recordingStatus"];
          };
          r.cameras.setRecordingStatus(p.cameraId, p.status);
          return reply({ stored: true });
        }
        case "motionEvent.create": {
          const p = request.payload as { cameraId: string; state: "started" | "ended"; occurredAt: string; receivedAt: string; recordingId?: string | null };
          if (!this.db || !Number.isFinite(Date.parse(p.occurredAt)) || !Number.isFinite(Date.parse(p.receivedAt)))
            return error("VALIDATION_ERROR", "Evento de movimento inválido.");
          const id = randomUUID();
          const result = this.db.prepare(`INSERT OR IGNORE INTO motion_events (id, camera_id, state, occurred_at, received_at, recording_id) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(id, p.cameraId, p.state, p.occurredAt, p.receivedAt, p.recordingId ?? null);
          const existing = result.changes === 1 ? id : (this.db.prepare(`SELECT id FROM motion_events WHERE camera_id = ? AND state = ? AND occurred_at = ?`)
            .get(p.cameraId, p.state, p.occurredAt) as { id: string } | undefined)?.id ?? null;
          return reply({ id: existing, stored: result.changes === 1 });
        }
        case "motionEvent.link": {
          const p = request.payload as { id: string; recordingId: string };
          const result = this.db?.prepare(`UPDATE motion_events SET recording_id = ? WHERE id = ? AND camera_id = (SELECT camera_id FROM recordings WHERE id = ?)`)
            .run(p.recordingId, p.id, p.recordingId);
          return reply({ linked: (result?.changes ?? 0) > 0 });
        }
        case "motionEvent.list": {
          const p = request.payload as { cameraId: string; startAt: string; endAt: string; state?: "started" | "ended" };
          const rows = this.db?.prepare(`SELECT m.id, m.camera_id AS cameraId, m.state,
            m.occurred_at AS occurredAt, m.received_at AS receivedAt,
            m.recording_id AS recordingId,
            EXISTS(SELECT 1 FROM recording_segments s WHERE s.recording_id = m.recording_id) AS hasVideo
            FROM motion_events m
            WHERE m.camera_id = ? AND m.received_at >= ? AND m.received_at < ?
              AND (? IS NULL OR m.state = ?)
            ORDER BY m.received_at DESC LIMIT 1000`)
            .all(p.cameraId, p.startAt, p.endAt, p.state ?? null, p.state ?? null) as Array<Record<string, unknown>> | undefined;
          return reply((rows ?? []).map((row) => ({ ...row, hasVideo: row.hasVideo === 1 })));
        }
        case "camera.getCapabilities": {
          const p = request.payload as { cameraId: string };
          const caps = r.capabilities.get(p.cameraId);
          return caps ? reply(caps) : reply(null);
        }
        case "credential.set": {
          const p = request.payload as {
            cameraId: string;
            service: string;
          } & Record<string, unknown>;
          r.credentials.upsert(p.cameraId, p.service, p as never);
          return reply({ stored: true });
        }
        case "credential.get": {
          const p = request.payload as { cameraId: string; service: string };
          const credential = r.credentials.get(p.cameraId, p.service);
          return credential
            ? reply(credential)
            : error("NOT_FOUND", "Credencial não encontrada.");
        }
        case "credential.has": {
          const p = request.payload as { cameraId: string };
          return reply(r.credentials.hasCredential(p.cameraId));
        }
        case "credential.listServices": {
          const p = request.payload as { cameraId: string };
          return reply(r.credentials.listServices(p.cameraId));
        }
        case "credential.remove": {
          const p = request.payload as { cameraId: string; service?: string };
          r.credentials.remove(p.cameraId, p.service);
          return reply({ removed: true });
        }
        case "profile.replaceAll": {
          const p = request.payload as { cameraId: string } & {
            profiles: Parameters<ProfileRepository["replaceAll"]>[1];
          };
          return reply(r.profiles.replaceAll(p.cameraId, p.profiles));
        }
        case "profile.list": {
          const p = request.payload as { cameraId: string };
          return reply(r.profiles.list(p.cameraId));
        }
        case "recording.create": {
          const p = request.payload as { cameraId: string };
          return reply(r.recordings.create(p.cameraId));
        }
        case "recording.importSdCard": {
          const p = request.payload as Parameters<RecordingRepository['importSdCard']>[0];
          return reply(r.recordings.importSdCard(p));
        }
        case "recording.complete": {
          const p = request.payload as { id: string; status: string };
          return reply(r.recordings.complete(p.id, p.status as never));
        }
        case "recording.extendStart": {
          const p = request.payload as { id: string; startedAt: string };
          return reply(r.recordings.extendStart(p.id, p.startedAt));
        }
        case "recording.get": {
          const p = request.payload as { id: string };
          return reply(r.recordings.getById(p.id));
        }
        case "recording.delete": {
          const p = request.payload as { id: string };
          return reply(r.recordings.delete(p.id));
        }
        case "recording.list": {
          const p = request.payload as { cameraId: string };
          return reply(r.recordings.list(p.cameraId));
        }
        case "recording.library": {
          const p = request.payload as {
            cameraId?: string;
            startAt?: string;
            endAt?: string;
            occurrence?: 'all' | 'with-motion' | 'without-motion';
          };
          return reply(r.recordings.listLibrary(p));
        }
        case "recording.libraryById": {
          const p = request.payload as { id: string };
          return reply(r.recordings.libraryById(p.id));
        }
        case "recording.segment.create": {
          const p = request.payload as Parameters<
            RecordingRepository["addSegment"]
          >[0];
          return reply(r.recordings.addSegment(p));
        }
        case "recording.segment.list": {
          const p = request.payload as { recordingId: string };
          return reply(r.recordings.listSegments(p.recordingId));
        }
        case "schedule.list": {
          const db = this.database!;
          const p = request.payload as { cameraId: string };
          const rows = db.prepare(
            "SELECT id, weekday, start_time AS start, end_time AS end, enabled FROM recording_schedules WHERE camera_id = ? ORDER BY weekday, start_time",
          ).all(p.cameraId);
          return reply(rows);
        }
        case "schedule.replace": {
          const db = this.database!;
          const p = request.payload as { cameraId: string; periods: Array<{ weekday: number; start: string; end: string; enabled: boolean }> };
          if (!Array.isArray(p.periods) || !p.periods.every((period) => SchedulePeriodSchema.safeParse(period).success)) {
            return error("VALIDATION_ERROR", "Períodos de agenda inválidos.");
          }
          const remove = db.prepare("DELETE FROM recording_schedules WHERE camera_id = ?");
          const insert = db.prepare("INSERT INTO recording_schedules (id, camera_id, weekday, start_time, end_time, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
          db.transaction(() => {
            remove.run(p.cameraId);
            const now = new Date().toISOString();
            for (const period of p.periods) insert.run(randomUUID(), p.cameraId, period.weekday, period.start, period.end, period.enabled ? 1 : 0, now, now);
          })();
          return reply(true);
        }
        case "snapshot.create": {
          const p = request.payload as { cameraId: string; path: string };
          return reply(r.snapshots.create(p.cameraId, p.path));
        }
        case "snapshot.get": {
          const p = request.payload as { id: string };
          return reply(r.snapshots.getById(p.id));
        }
        case "snapshot.delete": {
          const p = request.payload as { id: string };
          return reply(r.snapshots.delete(p.id));
        }
        case "snapshot.list": {
          const p = request.payload as {
            cameraId?: string;
            startAt?: string;
            endAt?: string;
          };
          return reply(r.snapshots.list(p));
        }
        case "media.metadata.get": {
          const parsed = MediaMetadataInputSchema.pick({
            kind: true,
            mediaId: true,
          }).safeParse(request.payload);
          if (!parsed.success) {
            return error("VALIDATION_ERROR", "Metadados de mídia inválidos.");
          }
          return reply(r.metadata.get(parsed.data.kind, parsed.data.mediaId));
        }
        case "media.metadata.upsert": {
          const parsed = MediaMetadataInputSchema.safeParse(request.payload);
          if (!parsed.success) {
            return error("VALIDATION_ERROR", "Metadados de mídia inválidos.");
          }
          const input = parsed.data;
          const media =
            input.kind === "snapshot"
              ? r.snapshots.getById(input.mediaId)
              : r.recordings.getById(input.mediaId);
          if (!media) return error("NOT_FOUND", "Mídia não encontrada.");
          if (
            input.kind === "recording" &&
            (input.sourceRecordingId || input.sourcePositionMs !== null)
          ) {
            return error(
              "VALIDATION_ERROR",
              "A gravação não pode ter uma origem ou posição de origem.",
            );
          }
          if (!input.sourceRecordingId && input.sourcePositionMs !== null) {
            return error(
              "VALIDATION_ERROR",
              "A posição de origem exige uma gravação de origem.",
            );
          }
          if (input.sourceRecordingId) {
            const source = r.recordings.getById(input.sourceRecordingId);
            if (!source) return error("NOT_FOUND", "Gravação de origem não encontrada.");
            if (source.cameraId !== media.cameraId) {
              return error(
                "VALIDATION_ERROR",
                "A gravação de origem deve pertencer à mesma câmera.",
              );
            }
          }
          return reply(r.metadata.upsert(input));
        }
        case "preference.get": {
          const p = request.payload as { key: string };
          const value = r.preferences.get(p.key);
          return value === null ? reply(null) : reply(value);
        }
        case "preference.set": {
          const p = request.payload as { key: string; value: string };
          r.preferences.set(p.key, p.value);
          return reply({ stored: true });
        }
        default:
          return error("NOT_FOUND", `Operação desconhecida: ${request.op}`);
      }
    } catch {
      return error("INTERNAL_ERROR", "Falha ao processar a operação.");
    }
  }
}

export async function createSqliteWorker(
  dbPath: string,
  migrations: Migration[],
  backupDir?: string,
): Promise<SqliteWorker> {
  const worker = new SqliteWorker(migrations);
  worker.open(dbPath, backupDir);
  return worker;
}
