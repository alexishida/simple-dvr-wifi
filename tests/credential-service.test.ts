import { describe, expect, it } from 'vitest'
import { createInMemoryTransport, DatabaseSupervisor } from '../src/main/supervisors/database.js'
import { CredentialService } from '../src/main/services/credentials.js'
import { FakeMasterKeyStore, InMemoryMasterKeyStore } from '../src/main/security/vault.js'
import { createTempDir, createTempDbPath, createTestWorker } from './helpers/database.js'

function setup() {
  const dir = createTempDir()
  const dbPath = createTempDbPath(dir)
  const worker = createTestWorker(dbPath)
  const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))
  return { dir, worker, supervisor }
}

describe('credential service', () => {
  it('stores and retrieves credentials per service without revealing plaintext', async () => {
    const { worker, supervisor } = setup()
    const credentials = new CredentialService(supervisor, new FakeMasterKeyStore())
    await credentials.initialize()

    const createResponse = await supervisor.request('camera.create', {
      name: 'Entrada',
      host: 'cam.local',
    })
    const cameraId = (createResponse.value as { id: string }).id

    await credentials.setCredential(cameraId, { service: 'onvif', password: 'segredo-onvif' })
    await credentials.setCredential(cameraId, { service: 'rtsp', password: 'segredo-rtsp' })

    expect(await credentials.hasCredential(cameraId)).toBe(true)
    expect(await credentials.listCredentialServices(cameraId)).toEqual(['onvif', 'rtsp'])
    expect(await credentials.getCredential(cameraId, 'onvif')).toBe('segredo-onvif')
    expect(await credentials.getCredential(cameraId, 'rtsp')).toBe('segredo-rtsp')

    const list = await supervisor.request('camera.list', undefined)
    const cameras = list.value as { id: string; name: string }[]
    expect(JSON.stringify(cameras)).not.toContain('segredo-onvif')
    expect(JSON.stringify(cameras)).not.toContain('segredo-rtsp')

    worker.close()
  })

  it('substitutes a password without revealing the old one', async () => {
    const { worker, supervisor } = setup()
    const credentials = new CredentialService(supervisor, new FakeMasterKeyStore())
    await credentials.initialize()

    const createResponse = await supervisor.request('camera.create', {
      name: 'Cam',
      host: 'cam.local',
    })
    const cameraId = (createResponse.value as { id: string }).id

    await credentials.setCredential(cameraId, { service: 'rtsp', password: 'senha-antiga' })
    await credentials.setCredential(cameraId, { service: 'rtsp', password: 'senha-nova' })

    expect(await credentials.getCredential(cameraId, 'rtsp')).toBe('senha-nova')

    const creds = await credentials.encryptedCredentialsForCamera(cameraId)
    expect(JSON.stringify(creds)).not.toContain('senha-antiga')
    expect(JSON.stringify(creds)).not.toContain('senha-nova')

    worker.close()
  })

  it('removes all credentials when the camera is removed', async () => {
    const { worker, supervisor } = setup()
    const credentials = new CredentialService(supervisor, new FakeMasterKeyStore())
    await credentials.initialize()

    const createResponse = await supervisor.request('camera.create', {
      name: 'Cam',
      host: 'cam.local',
    })
    const cameraId = (createResponse.value as { id: string }).id
    await credentials.setCredential(cameraId, { service: 'rtsp', password: 'x' })

    await supervisor.request('camera.remove', { id: cameraId })
    expect(await credentials.hasCredential(cameraId)).toBe(false)

    worker.close()
  })

  it('blocks credential persistence when the secure backend is unavailable', async () => {
    const { worker, supervisor } = setup()
    const store = new InMemoryMasterKeyStore()
    store.available = false
    const credentials = new CredentialService(supervisor, store)
    await credentials.initialize()

    const createResponse = await supervisor.request('camera.create', {
      name: 'Cam',
      host: 'cam.local',
    })
    const cameraId = (createResponse.value as { id: string }).id

    expect(credentials.isAvailable).toBe(false)
    await expect(
      credentials.setCredential(cameraId, { service: 'rtsp', password: 'x' }),
    ).rejects.toThrow(/safeStorage indisponível/)
    expect(await credentials.hasCredential(cameraId)).toBe(false)

    worker.close()
  })
})
