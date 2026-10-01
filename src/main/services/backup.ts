import { open, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { DatabaseSupervisor } from '../supervisors/database.js'

export const MAX_IMPORT_BYTES = 64 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.sqlite', '.db', '.sqlite3'])

export interface BackupPreview {
  bytes: number
  cameras: number
  recordings: number
  snapshots: number
  schedules: number
  hasConfiguration: boolean
  credentialsExcluded: boolean
}

export class BackupService {
  constructor(private readonly database: DatabaseSupervisor) {}

  async exportTo(destination: string): Promise<BackupPreview> {
    const response = await this.database.request('backup.export', { destination })
    if (!response.ok) throw new Error('Não foi possível exportar o backup.')
    return response.value as BackupPreview
  }

  async inspectImportFile(filePath: string): Promise<BackupPreview> {
    const extension = extname(filePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error('Extensão de banco não permitida.')
    }
    const fileStat = await stat(filePath)
    if (!fileStat.isFile() || fileStat.size < 16 || fileStat.size > MAX_IMPORT_BYTES) {
      throw new Error('Arquivo de backup fora do limite permitido.')
    }
    const file = await open(filePath, 'r')
    try {
      const header = Buffer.alloc(16)
      const { bytesRead } = await file.read(header, 0, header.length, 0)
      if (bytesRead !== header.length || !header.toString('utf8').startsWith('SQLite format 3')) {
        throw new Error('Arquivo não é um banco SQLite válido.')
      }
    } finally {
      await file.close()
    }
    const response = await this.database.request('backup.inspect', { source: filePath })
    if (!response.ok) throw new Error('Não foi possível verificar a integridade do backup.')
    return { ...(response.value as Omit<BackupPreview, 'bytes'>), bytes: fileStat.size }
  }
}
