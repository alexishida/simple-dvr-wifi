import { describe, expect, it } from 'vitest'
import { createInMemoryTransport, DatabaseSupervisor } from '../src/main/supervisors/database.js'
import { createTempDir, createTempDbPath, createTestWorker } from './helpers/database.js'

describe('SQLite worker and supervisor', () => {
  it('responds to health check and rejects before initialization', async () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir)
    const worker = createTestWorker(dbPath)
    const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))

    expect(await supervisor.healthCheck()).toBe(true)
    expect(await supervisor.request('integrity', undefined)).toMatchObject({ ok: true })
    worker.close()
  })

  it('handles concurrent operations without blocking', async () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir)
    const worker = createTestWorker(dbPath)
    const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        supervisor.request('camera.create', { name: `Câmera ${i}`, host: `cam-${i}.local` }),
      ),
    )

    expect(responses.every((r) => r.ok)).toBe(true)
    const list = await supervisor.request('camera.list', undefined)
    expect(list.ok && (list.value as unknown[]).length).toBe(20)
    worker.close()
  })

  it('returns NOT_FOUND for unknown operations', async () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir)
    const worker = createTestWorker(dbPath)
    const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))

    const response = await supervisor.request('unknown.op', undefined)
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.error.code).toBe('NOT_FOUND')
    worker.close()
  })

  it('times out requests when the worker does not respond', async () => {
    const transport = {
      postMessage: () => undefined,
      onMessage: () => undefined,
      onExit: () => undefined,
      kill: () => undefined,
    }
    const supervisor = new DatabaseSupervisor(transport)

    const response = await supervisor.request('health', undefined, 50)
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.error.code).toBe('NETWORK_ERROR')
  })

  it('supports close and shutdown', async () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir)
    const worker = createTestWorker(dbPath)
    const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))

    await supervisor.shutdown(1_000)
    expect(worker.isReady()).toBe(false)
  })
})
