import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { DatabaseSupervisor } from '../supervisors/database.js'

export const MAX_IMPORT_BYTES = 64 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.sqlite', '.db', '.sqlite3'])

export class BackupService {
  constructor(private readonly database: DatabaseSupervisor) {}

  async exportTo(destination: string): Promise<{ exported: true }> {
    const response = await this.database.request('backup.export', { destination })
    if (!response.ok) {
      throw new Error('Não foi possível exportar o backup.')
    }
    return { exported: true }
  }

  async validateImportFile(filePath: string): Promise<{ ok: true; bytes: number }> {
    const extension = extname(filePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error('Esquema proibido: extensão de banco não permitida.')
    }

    const fileStat = await stat(filePath)
    if (fileStat.size > MAX_IMPORT_BYTES) {
      throw new Error('Arquivo acima do limite permitido.')
    }

    const buffer = await readFile(filePath)
    const magic = buffer.subarray(0, 16).toString('utf8')
    if (!magic.startsWith('SQLite format 3')) {
      throw new Error('Arquivo não é um banco SQLite válido.')
    }

    return { ok: true, bytes: fileStat.size }
  }
}
