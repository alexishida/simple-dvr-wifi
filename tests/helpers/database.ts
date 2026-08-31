import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteWorker } from '../../src/workers/database/worker.js'
import { MIGRATIONS } from '../../src/workers/database/migrations.js'

export function createTempDir(prefix = 'swc-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function createTestWorker(dbPath: string): SqliteWorker {
  const worker = new SqliteWorker(MIGRATIONS)
  worker.open(dbPath)
  return worker
}

export function createTempDbPath(dir: string, name = 'test.sqlite'): string {
  return join(dir, name)
}
