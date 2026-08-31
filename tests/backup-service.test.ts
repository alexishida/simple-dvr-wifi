import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createInMemoryTransport, DatabaseSupervisor } from '../src/main/supervisors/database.js'
import { BackupService, MAX_IMPORT_BYTES } from '../src/main/services/backup.js'
import { CredentialService } from '../src/main/services/credentials.js'
import { FakeMasterKeyStore } from '../src/main/security/vault.js'
import { createTempDir, createTempDbPath, createTestWorker } from './helpers/database.js'

describe('backup and import service', () => {
  it('exports an encrypted backup without plaintext credentials', async () => {
    const dir = createTempDir()
    const dbPath = createTempDbPath(dir)
    const worker = createTestWorker(dbPath)
    const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker))

    const credentials = new CredentialService(supervisor, new FakeMasterKeyStore())
    await credentials.initialize()

    const createResponse = await supervisor.request('camera.create', {
      name: 'Entrada',
      host: 'cam.local',
    })
    const cameraId = (createResponse.value as { id: string }).id
    const password = 'senha-canario-que-nao-pode-aparecer-no-backup'
    await credentials.setCredential(cameraId, { service: 'rtsp', password })

    const destination = join(dir, 'backup.sqlite')
    const backup = new BackupService(supervisor)
    await backup.exportTo(destination)

    const content = await readFile(destination, 'utf8')
    expect(content).toContain('SQLite format 3')
    expect(content).not.toContain(password)
    expect(content).not.toContain(Buffer.from(password).toString('base64'))

    worker.close()
  })

  it('rejects a non-SQLite file', async () => {
    const dir = createTempDir()
    const file = join(dir, 'fake.sqlite')
    await writeFile(file, 'isto não é um banco sqlite de verdade'.repeat(10), 'utf8')

    const backup = new BackupService({} as never)
    await expect(backup.validateImportFile(file)).rejects.toThrow(/SQLite/)
  })

  it('rejects forbidden extensions', async () => {
    const dir = createTempDir()
    const file = join(dir, 'config.txt')
    await writeFile(file, 'content', 'utf8')

    const backup = new BackupService({} as never)
    await expect(backup.validateImportFile(file)).rejects.toThrow(/Esquema proibido/)
  })

  it('rejects files above the size limit', async () => {
    const dir = createTempDir()
    const file = join(dir, 'huge.sqlite')
    await mkdir(dir, { recursive: true })
    const handle = await import('node:fs/promises').then((m) => m.open(file, 'w'))
    await handle.truncate(MAX_IMPORT_BYTES + 1)
    await handle.close()

    const backup = new BackupService({} as never)
    await expect(backup.validateImportFile(file)).rejects.toThrow(/limite/)
  })
})
