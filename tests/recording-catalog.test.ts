import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RecordingCatalogService } from '../src/main/services/recording-catalog.js'
import { createInMemoryTransport, DatabaseSupervisor } from '../src/main/supervisors/database.js'
import { createTempDir, createTempDbPath, createTestWorker } from './helpers/database.js'

function setup() {
  const dir = createTempDir()
  const dbPath = createTempDbPath(dir)
  const worker = createTestWorker(dbPath)
  const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))
  const libraryRoot = mkdtempSync(join(tmpdir(), 'swc-rec-'))
  const catalog = new RecordingCatalogService(supervisor, {
    cameraId: '',
    libraryRoot,
    segmentDurationMs: 1000,
    minFreeBytes: 1,
    rpoMs: 3000,
  })
  return { worker, supervisor, libraryRoot, catalog }
}

async function createCamera(supervisor: DatabaseSupervisor, name: string): Promise<string> {
  const response = await supervisor.request('camera.create', { name, host: `${name}.local` })
  return (response.value as { id: string }).id
}

describe('recording catalog service', () => {
  it('starts a session and opens a recording segment', async () => {
    const { worker, supervisor, catalog } = setup()
    const cameraId = await createCamera(supervisor, 'cam-a')
    const state = await catalog.start(cameraId)

    expect(state.status).toBe('recording')
    expect(state.segments).toHaveLength(1)
    expect(state.segments[0]?.status).toBe('recording')
    expect(state.writeAllowed).toBe(true)

    worker.close()
  })

  it('rotates segments and completes on stop', async () => {
    const { worker, supervisor, catalog } = setup()
    const cameraId = await createCamera(supervisor, 'cam-a')
    const state = await catalog.start(cameraId)
    await new Promise((resolve) => setTimeout(resolve, 10))

    await catalog.rotateSegment(cameraId)
    expect(state.segments).toHaveLength(2)
    expect(state.segments[0]?.status).toBe('completed')
    expect(state.segments[0]?.durationMs).toBeGreaterThanOrEqual(0)

    await catalog.stop(cameraId)
    expect(state.status).toBe('completed')
    expect(catalog.activeSessions).toHaveLength(0)

    const list = await supervisor.request('recording.list', { cameraId })
    const recordings = list.value as { status: string }[]
    expect(recordings).toHaveLength(1)
    expect(recordings[0]?.status).toBe('completed')

    worker.close()
  })

  it('marks a session interrupted after a camera drop', async () => {
    const { worker, supervisor, catalog } = setup()
    const cameraId = await createCamera(supervisor, 'cam-a')
    const state = await catalog.start(cameraId)
    await new Promise((resolve) => setTimeout(resolve, 10))

    await catalog.markInterrupted(cameraId, 'camera_drop')
    expect(state.status).toBe('interrupted')
    expect(state.segments[0]?.status).toBe('interrupted')

    const list = await supervisor.request('recording.list', { cameraId })
    expect((list.value as { status: string }[])[0]?.status).toBe('interrupted')

    worker.close()
  })

  it('keeps the valid last segment within the RPO window', async () => {
    const { worker, supervisor, catalog } = setup()
    const cameraId = await createCamera(supervisor, 'cam-a')
    const state = await catalog.start(cameraId)
    await new Promise((resolve) => setTimeout(resolve, 5))
    await catalog.rotateSegment(cameraId)
    await new Promise((resolve) => setTimeout(resolve, 5))

    await catalog.markInterrupted(cameraId, 'sidecar_crash')
    expect(state.segments).toHaveLength(2)
    expect(state.segments[0]?.status).toBe('completed')
    expect(state.segments[1]?.status).toBe('interrupted')

    worker.close()
  })

  it('recovers and flushes sessions on shutdown', async () => {
    const { worker, supervisor, catalog } = setup()
    const camA = await createCamera(supervisor, 'cam-a')
    const camB = await createCamera(supervisor, 'cam-b')
    await catalog.start(camA)
    await catalog.start(camB)

    expect(catalog.activeSessions).toHaveLength(2)
    const flushed = await catalog.flushAll()
    expect(flushed).toBe(2)
    expect(catalog.activeSessions).toHaveLength(0)

    worker.close()
  })

  it('confines segment paths to the library', async () => {
    const { worker, supervisor, catalog } = setup()
    const cameraId = await createCamera(supervisor, 'cam-a')
    const state = await catalog.start(cameraId)
    const path = state.segments[0]?.path ?? ''
    expect(path).toContain('recordings')
    expect(path).toContain(cameraId)
    worker.close()
  })
})
