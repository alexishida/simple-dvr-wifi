import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  runMigrations,
  integrityCheck,
  type Migration,
} from '../src/workers/database/migrations.js'
import { createTempDir, createTempDbPath } from './helpers/database.js'

describe('migrations and schema v1', () => {
  it('applies v1 schema to an empty database', () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir, 'schema.sqlite')
    const db = new Database(dbPath)

    const result = runMigrations(db)
    expect(result.applied).toEqual([1])

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)

    for (const expected of [
      'schema_migrations',
      'cameras',
      'camera_endpoints',
      'camera_profiles',
      'camera_capabilities',
      'camera_credentials',
      'recordings',
      'recording_segments',
      'snapshots',
      'preferences',
      'diagnostics',
    ]) {
      expect(names).toContain(expected)
    }

    expect(integrityCheck(db).ok).toBe(true)
    db.close()
  })

  it('is idempotent across restarts', () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir, 'idempotent.sqlite')
    const db = new Database(dbPath)

    expect(runMigrations(db).applied).toEqual([1])
    expect(runMigrations(db).applied).toEqual([])
    expect(runMigrations(db).applied).toEqual([])
    db.close()
  })

  it('rolls back a failing migration and preserves the previous version', () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir, 'rollback.sqlite')
    const backupDir = createTempDir('swc-backup-')
    const db = new Database(dbPath)

    expect(runMigrations(db).applied).toEqual([1])

    const failing: Migration = {
      version: 2,
      name: 'failing-migration',
      destructive: true,
      up: () => {
        throw new Error('falha simulada')
      },
    }

    expect(() => runMigrations(db, { dbPath, backupDir }, [failing])).toThrow('falha simulada')

    const row = db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as {
      version: number
    }
    expect(row.version).toBe(1)

    const backups = readdirSync(backupDir).filter((f) => f.startsWith('db-v2-'))
    expect(backups.length).toBe(1)
    expect(existsSync(`${backupDir}/${backups[0]}`)).toBe(true)

    const backupDb = new Database(`${backupDir}/${backups[0]}`)
    const backupRow = backupDb
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as { version: number }
    expect(backupRow.version).toBe(1)
    backupDb.close()

    db.close()
  })

  it('detects corruption via integrity check', () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir, 'corrupt.sqlite')
    const db = new Database(dbPath)
    runMigrations(db)

    db.exec('CREATE TABLE extra (id INTEGER PRIMARY KEY)')
    expect(integrityCheck(db).ok).toBe(true)
    db.close()
  })
})
