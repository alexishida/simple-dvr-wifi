import { describe, expect, it } from 'vitest'
import {
  checkStorageStatus,
  describeStorageProblem,
  shouldAllowWrite,
  type StorageProbe,
  type StorageStatus,
} from '../src/main/services/storage-monitor.js'

function probeFor(scenario: 'ok' | 'missing' | 'file' | 'no-perm' | 'disk-full'): StorageProbe {
  return {
    stat: async () => {
      if (scenario === 'missing') throw new Error('ENOENT')
      if (scenario === 'file') return { isDirectory: () => false, size: 10 } as never
      return { isDirectory: () => true, size: 10 } as never
    },
    access: async () => {
      if (scenario === 'no-perm') throw new Error('EACCES')
    },
    diskFree: async () =>
      scenario === 'disk-full'
        ? { free: 1_000, total: 1_000_000 }
        : { free: 1_000_000_000, total: 2_000_000_000 },
  }
}

describe('storage monitor', () => {
  it('reports a healthy writable directory', async () => {
    const status = await checkStorageStatus('C:\\Data\\recordings', {
      probe: probeFor('ok'),
      minFreeBytes: 256 * 1024 * 1024,
    })
    expect(status.exists).toBe(true)
    expect(status.isDirectory).toBe(true)
    expect(status.writable).toBe(true)
    expect(status.lowSpace).toBe(false)
    expect(shouldAllowWrite(status)).toBe(true)
    expect(describeStorageProblem(status)).toBeNull()
  })

  it('detects a removed directory', async () => {
    const status = await checkStorageStatus('X:\\gone', { probe: probeFor('missing') })
    expect(status.exists).toBe(false)
    expect(shouldAllowWrite(status)).toBe(false)
    expect(describeStorageProblem(status)).toContain('não encontrado')
  })

  it('rejects a file in place of a directory', async () => {
    const status = await checkStorageStatus('C:\\file.txt', { probe: probeFor('file') })
    expect(status.exists).toBe(true)
    expect(status.isDirectory).toBe(false)
    expect(describeStorageProblem(status)).toContain('não é um diretório')
  })

  it('reports missing write permission', async () => {
    const status = await checkStorageStatus('C:\\readonly', { probe: probeFor('no-perm') })
    expect(status.writable).toBe(false)
    expect(describeStorageProblem(status)).toContain('permissão')
  })

  it('blocks writes when disk is nearly full', async () => {
    const status = await checkStorageStatus('C:\\Data', {
      probe: probeFor('disk-full'),
      minFreeBytes: 256 * 1024 * 1024,
    })
    expect(status.lowSpace).toBe(true)
    expect(shouldAllowWrite(status)).toBe(false)
    expect(describeStorageProblem(status)).toContain('Espaço')
  })

  it('treats a removed target as inaccessible without crashing', () => {
    const status: StorageStatus = {
      path: 'Z:\\media',
      exists: false,
      isDirectory: false,
      writable: false,
      freeBytes: null,
      totalBytes: null,
      minFreeBytes: 1,
      lowSpace: false,
    }
    expect(describeStorageProblem(status)).toContain('não encontrado')
  })
})
