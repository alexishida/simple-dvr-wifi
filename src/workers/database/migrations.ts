import type Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { SCHEMA_MIGRATIONS_DDL, SCHEMA_V1_DDL } from './schema.js'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
  destructive: boolean
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    destructive: false,
    up: (db) => db.exec(SCHEMA_V1_DDL),
  },
  {
    version: 2,
    name: 'media-metadata',
    destructive: false,
    up: (db) =>
      db.exec(`
        CREATE TABLE media_metadata (
          media_kind TEXT NOT NULL CHECK (media_kind IN ('snapshot', 'recording')),
          media_id TEXT NOT NULL,
          favorite INTEGER NOT NULL DEFAULT 0,
          protected INTEGER NOT NULL DEFAULT 0,
          tags_json TEXT NOT NULL DEFAULT '[]',
          note TEXT NOT NULL DEFAULT '',
          source_recording_id TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (media_kind, media_id)
        );
        CREATE INDEX idx_media_metadata_favorite ON media_metadata (media_kind, favorite);
        CREATE INDEX idx_media_metadata_protected ON media_metadata (media_kind, protected);

        CREATE TRIGGER delete_snapshot_metadata
        AFTER DELETE ON snapshots
        BEGIN
          DELETE FROM media_metadata WHERE media_kind = 'snapshot' AND media_id = OLD.id;
        END;

        CREATE TRIGGER delete_recording_metadata
        AFTER DELETE ON recordings
        BEGIN
          DELETE FROM media_metadata WHERE media_kind = 'recording' AND media_id = OLD.id;
          DELETE FROM media_metadata WHERE source_recording_id = OLD.id;
        END;
      `),
  },
  {
    version: 3,
    name: 'media-metadata-source-position',
    destructive: false,
    up: (db) =>
      db.exec(
        'ALTER TABLE media_metadata ADD COLUMN source_position_ms INTEGER',
      ),
  },
  {
    version: 4,
    name: 'recording-schedules',
    destructive: false,
    up: (db) => db.exec(`
      CREATE TABLE recording_schedules (
        id TEXT PRIMARY KEY,
        camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_recording_schedules_camera ON recording_schedules (camera_id, weekday);
    `),
  },
]

export interface MigrationResult {
  applied: number[]
  backupPath: string | null
}

function currentVersion(db: Database.Database): number {
  db.exec(SCHEMA_MIGRATIONS_DDL)
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    )
    .get() as {
    version: number
  }
  return row.version
}

export function integrityCheck(db: Database.Database): {
  ok: boolean
  results: string[]
} {
  const rows = db.pragma('integrity_check') as { integrity_check: string }[]
  const results = rows.map((row) => row.integrity_check)
  return { ok: results.every((r) => r === 'ok'), results }
}

export function runMigrations(
  db: Database.Database,
  options: { dbPath?: string; backupDir?: string } = {},
  migrations: Migration[] = MIGRATIONS,
): MigrationResult {
  const version = currentVersion(db)
  const pending = migrations
    .filter((m) => m.version > version)
    .sort((a, b) => a.version - b.version)
  const applied: number[] = []
  let backupPath: string | null = null

  for (const migration of pending) {
    if (migration.destructive && options.dbPath && options.backupDir) {
      backupPath = createBackup(db, options.backupDir, migration.version)
    }

    db.transaction(() => {
      migration.up(db)
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migration.name, new Date().toISOString())
    })()

    applied.push(migration.version)
  }

  return { applied, backupPath }
}

export function createBackup(
  db: Database.Database,
  backupDir: string,
  forVersion: number,
): string {
  const resolvedDir = dirname(join(backupDir, 'placeholder'))
  mkdirSync(resolvedDir, { recursive: true })
  const target = join(
    backupDir,
    `db-v${forVersion}-${Date.now()}-${randomUUID()}.sqlite`,
  )
  // Copy the live SQLite snapshot, including committed pages still in the WAL.
  db.prepare('VACUUM INTO ?').run(target)
  return target
}

export function verifySchema(db: Database.Database): string[] {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as { name: string }[]
  return tables.map((t) => t.name)
}
