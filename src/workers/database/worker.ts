import type Database from "better-sqlite3";
import DatabaseConstructor from "better-sqlite3";
import type {
  CameraRecord,
  DbRequest,
  DbResponse,
} from "../../shared/database.js";
import {
  CameraRepository,
  CapabilityRepository,
  CredentialRepository,
  DiagnosticRepository,
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
  preferences: PreferenceRepository;
  diagnostics: DiagnosticRepository;
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
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    runMigrations(db, { dbPath, backupDir }, this.migrations);
    this.db = db;
    this.repos = {
      cameras: new CameraRepository(db),
      capabilities: new CapabilityRepository(db),
      credentials: new CredentialRepository(db),
      profiles: new ProfileRepository(db),
      recordings: new RecordingRepository(db),
      snapshots: new SnapshotRepository(db),
      preferences: new PreferenceRepository(db),
      diagnostics: new DiagnosticRepository(db),
    };
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.repos = null;
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
        return reply({ exported: true });
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
        case "recording.complete": {
          const p = request.payload as { id: string; status: string };
          return reply(r.recordings.complete(p.id, p.status as never));
        }
        case "recording.list": {
          const p = request.payload as { cameraId: string };
          return reply(r.recordings.list(p.cameraId));
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
        case "snapshot.create": {
          const p = request.payload as { cameraId: string; path: string };
          return reply(r.snapshots.create(p.cameraId, p.path));
        }
        case "snapshot.list": {
          const p = request.payload as { cameraId: string };
          return reply(r.snapshots.list(p.cameraId));
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
        case "diagnostic.append": {
          const p = request.payload as Parameters<
            DiagnosticRepository["append"]
          >[0];
          return reply(r.diagnostics.append(p));
        }
        case "diagnostic.list": {
          const p = request.payload as { limit?: number } | undefined;
          return reply(r.diagnostics.list(p?.limit));
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
