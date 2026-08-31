import { stat, access, constants } from 'node:fs/promises'

export interface StorageStatus {
  path: string
  exists: boolean
  isDirectory: boolean
  writable: boolean
  freeBytes: number | null
  totalBytes: number | null
  minFreeBytes: number
  lowSpace: boolean
}

export interface StorageProbe {
  stat(path: string): Promise<{ isDirectory(): boolean; size: number }>
  access(path: string, mode: number): Promise<void>
  diskFree(path: string): Promise<{ free: number; total: number }>
}

const SYSTEM_PROBE: StorageProbe = {
  stat: async (path) => (await stat(path)) as unknown as ReturnType<StorageProbe['stat']>,
  access: (path, mode) => access(path, mode),
  diskFree: async (path) => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const run = promisify(execFile)
    if (process.platform === 'win32') {
      const { stdout } = await run('powershell', [
        '-NoProfile',
        '-Command',
        `Get-PSDrive -Name (Split-Path -Qualifier '${path}') | Select-Object -ExpandProperty Free`,
      ])
      const free = Number.parseFloat(stdout.trim()) || 0
      return { free, total: free }
    }
    return { free: 0, total: 0 }
  },
}

export interface StorageMonitorOptions {
  probe?: StorageProbe
  minFreeBytes?: number
}

export async function checkStorageStatus(
  path: string,
  options: StorageMonitorOptions = {},
): Promise<StorageStatus> {
  const probe = options.probe ?? SYSTEM_PROBE
  const minFreeBytes = options.minFreeBytes ?? 256 * 1024 * 1024

  let exists = false
  let isDirectory = false
  let writable = false

  try {
    const info = await probe.stat(path)
    exists = true
    isDirectory = info.isDirectory()
  } catch {
    exists = false
  }

  if (exists) {
    try {
      await probe.access(path, constants.W_OK)
      writable = true
    } catch {
      writable = false
    }
  }

  let freeBytes: number | null = null
  let totalBytes: number | null = null
  try {
    const disk = await probe.diskFree(path)
    freeBytes = disk.free
    totalBytes = disk.total
  } catch {
    freeBytes = null
    totalBytes = null
  }

  const lowSpace = freeBytes !== null && freeBytes < minFreeBytes

  return {
    path,
    exists,
    isDirectory,
    writable,
    freeBytes,
    totalBytes,
    minFreeBytes,
    lowSpace,
  }
}

export function shouldAllowWrite(status: StorageStatus): boolean {
  return status.exists && status.isDirectory && status.writable && !status.lowSpace
}

export function describeStorageProblem(status: StorageStatus): string | null {
  if (!status.exists) return 'Diretório não encontrado.'
  if (!status.isDirectory) return 'Caminho não é um diretório.'
  if (!status.writable) return 'Sem permissão de escrita.'
  if (status.lowSpace) return 'Espaço em disco insuficiente.'
  return null
}
