import { createHash } from 'node:crypto'
import type { DatabaseSupervisor } from '../supervisors/database.js'
import type { DiagnosticRecord } from '../../shared/database.js'
import { sanitizeLine, sanitizeUrlCredentials } from '../logging/sanitizer.js'

export interface DiagnosticInput {
  cameraId?: string | null
  code: string
  message: string
}

export interface ExportableDiagnostic {
  appVersion: string
  platform: string
  generatedAt: string
  diagnostics: Array<{
    code: string
    message: string
    count: number
    firstSeen: string
    lastSeen: string
  }>
}

export function fingerprintDiagnostic(input: DiagnosticInput): string {
  return createHash('sha256')
    .update(`${input.cameraId ?? ''}|${input.code}|${sanitize(input.message)}`)
    .digest('hex')
}

function sanitize(message: string): string {
  return sanitizeUrlCredentials(sanitizeLine(message))
}

export class DiagnosticService {
  constructor(private readonly database: DatabaseSupervisor) {}

  async record(input: DiagnosticInput): Promise<DiagnosticRecord> {
    const message = sanitize(input.message)
    const response = await this.database.request('diagnostic.append', {
      cameraId: input.cameraId ?? null,
      code: input.code,
      message,
      fingerprint: fingerprintDiagnostic({ cameraId: input.cameraId, code: input.code, message }),
    })
    if (!response.ok) {
      throw new Error('Não foi possível registrar o diagnóstico.')
    }
    return response.value as DiagnosticRecord
  }

  async list(limit = 100): Promise<DiagnosticRecord[]> {
    const response = await this.database.request('diagnostic.list', { limit })
    return response.ok ? (response.value as DiagnosticRecord[]) : []
  }

  async exportable(appVersion: string, platform: string): Promise<ExportableDiagnostic> {
    const diagnostics = await this.list(100)
    return {
      appVersion,
      platform,
      generatedAt: new Date().toISOString(),
      diagnostics: diagnostics.map((d) => ({
        code: d.code,
        message: d.message,
        count: d.count,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
      })),
    }
  }
}
