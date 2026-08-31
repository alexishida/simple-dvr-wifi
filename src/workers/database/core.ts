import { integrityCheck, runMigrations, type Migration } from './migrations.js'
import { SCHEMA_MIGRATIONS_DDL } from './schema.js'
import type Database from 'better-sqlite3'

export class SqliteCore {
  constructor(
    private readonly db: Database.Database,
    private readonly migrations: Migration[],
  ) {}

  initialize(options: { dbPath?: string; backupDir?: string } = {}): {
    applied: number[]
    backupPath: string | null
  } {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    return runMigrations(this.db, options, this.migrations)
  }

  integrity(): { ok: boolean; results: string[] } {
    return integrityCheck(this.db)
  }

  currentVersion(): number {
    this.db.exec(SCHEMA_MIGRATIONS_DDL)
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as {
      version: number
    }
    return row.version
  }

  close(): void {
    this.db.close()
  }
}
