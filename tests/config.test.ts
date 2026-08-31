import { describe, expect, it } from 'vitest'
import { ConfigRepository } from '../src/main/services/config.js'
import { createInMemoryTransport, DatabaseSupervisor } from '../src/main/supervisors/database.js'
import {
  CONFIG_DEFAULTS,
  parseConfig,
  serializeConfig,
  AppConfigSchema,
} from '../src/shared/config.js'
import { createTempDir, createTempDbPath, createTestWorker } from './helpers/database.js'

function setup() {
  const dir = createTempDir()
  const dbPath = createTempDbPath(dir)
  const worker = createTestWorker(dbPath)
  const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))
  return { worker, supervisor }
}

describe('config repository', () => {
  it('returns defaults when nothing is stored', async () => {
    const { worker, supervisor } = setup()
    const repo = new ConfigRepository(supervisor)
    const config = await repo.load()

    expect(config).toEqual(CONFIG_DEFAULTS)
    worker.close()
  })

  it('persists and restores configuration after restart', async () => {
    const { worker, supervisor } = setup()
    const repo = new ConfigRepository(supervisor)

    const custom = {
      ...CONFIG_DEFAULTS,
      theme: 'light' as const,
      reconnect: { initialDelayMs: 2_000, maxDelayMs: 30_000, maxAttempts: 5 },
      log: { level: 'debug' as const, maxBytes: 1024 * 1024, maxFiles: 3 },
    }

    await repo.save(custom)

    const restored = await repo.load()
    expect(restored).toEqual(custom)
    worker.close()
  })

  it('falls back to defaults on malformed stored data', async () => {
    const { worker, supervisor } = setup()
    await supervisor.request('preference.set', { key: 'app.config', value: '{invalid json' })

    const repo = new ConfigRepository(supervisor)
    expect(await repo.load()).toEqual(CONFIG_DEFAULTS)
    worker.close()
  })

  it('rejects an out-of-range value via schema', () => {
    const bad = {
      ...CONFIG_DEFAULTS,
      reconnect: { initialDelayMs: 1, maxDelayMs: 60_000, maxAttempts: 10 },
    }
    expect(AppConfigSchema.safeParse(bad).success).toBe(false)
    expect(() => serializeConfig(bad as never)).toThrow()
  })

  it('round-trips serialization', () => {
    expect(parseConfig(serializeConfig(CONFIG_DEFAULTS))).toEqual(CONFIG_DEFAULTS)
  })
})
