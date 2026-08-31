import { describe, expect, it } from 'vitest'
import { DiagnosticService, fingerprintDiagnostic } from '../src/main/services/diagnostics.js'
import { createInMemoryTransport, DatabaseSupervisor } from '../src/main/supervisors/database.js'
import { createTempDir, createTempDbPath, createTestWorker } from './helpers/database.js'

function setup() {
  const dir = createTempDir()
  const dbPath = createTempDbPath(dir)
  const worker = createTestWorker(dbPath)
  const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))
  return { worker, supervisor }
}

async function createCamera(supervisor: DatabaseSupervisor, name: string): Promise<string> {
  const response = await supervisor.request('camera.create', { name, host: `${name}.local` })
  return (response.value as { id: string }).id
}

describe('diagnostic service', () => {
  it('consolidates identical failures by fingerprint', async () => {
    const { worker, supervisor } = setup()
    const service = new DiagnosticService(supervisor)
    const cameraId = await createCamera(supervisor, 'cam')

    const input = { cameraId, code: 'NETWORK_ERROR', message: 'Sem resposta' }
    const first = await service.record(input)
    const second = await service.record(input)

    expect(first.count).toBe(1)
    expect(second.count).toBe(2)

    const list = await service.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ code: 'NETWORK_ERROR', count: 2 })

    worker.close()
  })

  it('creates separate entries for different fingerprints', async () => {
    const { worker, supervisor } = setup()
    const service = new DiagnosticService(supervisor)
    const camA = await createCamera(supervisor, 'cam-a')
    const camB = await createCamera(supervisor, 'cam-b')

    await service.record({ cameraId: camA, code: 'AUTH_ERROR', message: 'Credencial inválida' })
    await service.record({ cameraId: camB, code: 'AUTH_ERROR', message: 'Credencial inválida' })
    await service.record({ cameraId: camA, code: 'NETWORK_ERROR', message: 'Sem resposta' })

    expect(await service.list()).toHaveLength(3)
    worker.close()
  })

  it('generates a stable fingerprint', () => {
    const input = { code: 'X', message: 'msg' }
    expect(fingerprintDiagnostic(input)).toBe(fingerprintDiagnostic(input))
    expect(fingerprintDiagnostic(input)).not.toBe(
      fingerprintDiagnostic({ ...input, message: 'outra' }),
    )
  })

  it('exports diagnostics without secrets', async () => {
    const { worker, supervisor } = setup()
    const service = new DiagnosticService(supervisor)
    const cameraId = await createCamera(supervisor, 'cam')

    await service.record({
      cameraId,
      code: 'NETWORK_ERROR',
      message: 'Falha na URL http://user:senha123@host',
    })
    const exportable = await service.exportable('0.1.0', 'win32')

    expect(exportable.appVersion).toBe('0.1.0')
    expect(exportable.platform).toBe('win32')
    expect(exportable.diagnostics).toHaveLength(1)
    const serialized = JSON.stringify(exportable)
    expect(serialized).not.toContain('senha123')
    expect(serialized).not.toContain(cameraId)

    worker.close()
  })
})
