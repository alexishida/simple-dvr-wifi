import { describe, expect, it } from 'vitest'
import { CameraManagementService } from '../src/main/services/camera-management.js'
import { CredentialService } from '../src/main/services/credentials.js'
import { FakeMasterKeyStore } from '../src/main/security/vault.js'
import { createInMemoryTransport, DatabaseSupervisor } from '../src/main/supervisors/database.js'
import { createTempDir, createTempDbPath, createTestWorker } from './helpers/database.js'

function setup() {
  const dir = createTempDir()
  const dbPath = createTempDbPath(dir)
  const worker = createTestWorker(dbPath)
  const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))
  const credentials = new CredentialService(supervisor, new FakeMasterKeyStore())
  void credentials.initialize()
  const service = new CameraManagementService(supervisor, credentials)
  return { worker, supervisor, credentials, service }
}

describe('camera management service', () => {
  it('detects duplicate by address, EPR and serial number', async () => {
    const { worker, service } = setup()

    await service.create({
      name: 'Entrada',
      host: '192.168.1.10',
      serialNumber: 'SN-100',
      epr: 'urn:uuid:aaa',
    })

    const duplicates = await service.checkDuplicates({
      host: '192.168.1.10',
      serialNumber: 'SN-100',
      epr: 'urn:uuid:aaa',
    })
    expect(duplicates.byAddress).not.toBeNull()
    expect(duplicates.bySerial).not.toBeNull()
    expect(duplicates.byEpr).not.toBeNull()

    worker.close()
  })

  it('blocks a duplicate without override and persists after confirmation', async () => {
    const { worker, service } = setup()

    await service.create({ name: 'Câmera A', host: '10.0.0.5', serialNumber: 'SN-X' })
    const attempt = await service.create({
      name: 'Câmera B',
      host: '10.0.0.6',
      serialNumber: 'SN-X',
    })

    expect(attempt.duplicate).toBe(true)

    const forced = await service.create({
      name: 'Câmera B',
      host: '10.0.0.6',
      serialNumber: 'SN-X',
      allowDuplicate: true,
    })
    expect(forced.duplicate).toBe(false)
    expect(forced.camera.name).toBe('Câmera B')

    const duplicates = await service.checkDuplicates({ serialNumber: 'SN-X' })
    expect(duplicates.bySerial?.name).toBe('Câmera A')

    worker.close()
  })

  it('supports onboarding with RTSP-only camera', async () => {
    const { worker, service, credentials } = setup()

    const result = await service.create({
      name: 'Somente RTSP',
      host: 'cam-rtsp.local',
      rtspUrl: 'rtsp://cam-rtsp.local/stream',
      username: 'admin',
      password: 'segredo',
    })

    expect(result.duplicate).toBe(false)
    expect(result.camera.endpoints.map((e) => e.service)).toContain('rtsp')
    expect(await credentials.hasCredential(result.camera.id)).toBe(true)

    worker.close()
  })

  it('preserves the stored credential when editing leaves password empty', async () => {
    const { worker, service, credentials } = setup()

    const result = await service.create({
      name: 'Cam',
      host: 'cam.local',
      rtspUrl: 'rtsp://cam.local/stream',
      username: 'admin',
      password: 'senha-original',
    })
    const cameraId = result.camera.id

    await service.updateCredentials(cameraId, { password: '', rtspPassword: '' })
    expect(await credentials.getCredential(cameraId, 'rtsp')).toBe('senha-original')
    expect(await credentials.getCredential(cameraId, 'onvif')).toBe('senha-original')

    worker.close()
  })

  it('replaces credential after auth_error without exposing the old one', async () => {
    const { worker, service, credentials } = setup()

    const result = await service.create({
      name: 'Cam',
      host: 'cam.local',
      rtspUrl: 'rtsp://cam.local/stream',
      username: 'admin',
      password: 'senha-antiga',
    })
    const cameraId = result.camera.id

    await service.updateCredentials(cameraId, { password: 'senha-nova' })
    expect(await credentials.getCredential(cameraId, 'onvif')).toBe('senha-nova')
    expect(await credentials.getCredential(cameraId, 'onvif')).not.toBe('senha-antiga')

    const serialized = JSON.stringify(await credentials.encryptedCredentialsForCamera(cameraId))
    expect(serialized).not.toContain('senha-antiga')
    expect(serialized).not.toContain('senha-nova')

    worker.close()
  })

  it('removes a camera and its credentials without affecting others', async () => {
    const { worker, service, credentials, supervisor } = setup()

    const first = await service.create({
      name: 'Cam A',
      host: 'cam-a.local',
      username: 'a',
      password: 'pa',
    })
    const second = await service.create({
      name: 'Cam B',
      host: 'cam-b.local',
      username: 'b',
      password: 'pb',
    })

    const removal = await service.remove(first.camera.id)
    expect(removal.removed).toBe(true)
    expect(await credentials.hasCredential(first.camera.id)).toBe(false)

    const list = await supervisor.request('camera.list', undefined)
    const cameras = list.value as { id: string }[]
    expect(cameras).toHaveLength(1)
    expect(cameras[0]?.id).toBe(second.camera.id)

    worker.close()
  })

  it('deactivates and reactivates a camera', async () => {
    const { worker, service, supervisor } = setup()

    const result = await service.create({ name: 'Cam', host: 'cam.local' })
    expect(await service.deactivate(result.camera.id)).toBe(true)

    const list = await supervisor.request('camera.list', undefined)
    expect((list.value as unknown[]).length).toBe(0)

    expect(await service.reactivate(result.camera.id)).toBe(true)
    const listAgain = await supervisor.request('camera.list', undefined)
    expect((listAgain.value as unknown[]).length).toBe(1)

    worker.close()
  })
})
