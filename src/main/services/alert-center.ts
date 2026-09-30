export type LocalAlertKind =
  | 'storage_low'
  | 'storage_unavailable'
  | 'camera_disconnected'
  | 'recording_interrupted'

export interface LocalAlert {
  id: string
  kind: LocalAlertKind
  cameraId: string | null
  message: string
  count: number
  firstOccurredAt: string
  lastOccurredAt: string
}

/** In-memory local alert centre. Repeated events share one visible alert. */
export class LocalAlertCenter {
  private readonly alerts = new Map<string, LocalAlert>()
  private storagePath: string | null = null

  async load(storagePath: string): Promise<void> {
    this.storagePath = storagePath
    try {
      const parsed: unknown = JSON.parse(await readFile(storagePath, 'utf8'))
      if (!Array.isArray(parsed)) return
      for (const value of parsed) {
        if (!value || typeof value !== 'object') continue
        const alert = value as Partial<LocalAlert>
        if (typeof alert.id !== 'string' || typeof alert.kind !== 'string' || typeof alert.message !== 'string' || typeof alert.count !== 'number' || typeof alert.firstOccurredAt !== 'string' || typeof alert.lastOccurredAt !== 'string') continue
        this.alerts.set(alert.id, { id: alert.id, kind: alert.kind as LocalAlertKind, cameraId: typeof alert.cameraId === 'string' ? alert.cameraId : null, message: sanitizeSidecarOutput(alert.message), count: alert.count, firstOccurredAt: alert.firstOccurredAt, lastOccurredAt: alert.lastOccurredAt })
      }
    } catch {
      // A missing or malformed history must not block application startup.
    }
  }

  private persist(): void {
    if (!this.storagePath) return
    void mkdir(dirname(this.storagePath), { recursive: true })
      .then(() => writeFile(this.storagePath!, JSON.stringify(this.list()), 'utf8'))
      .catch(() => undefined)
  }

  report(kind: LocalAlertKind, message: string, cameraId: string | null = null): LocalAlert {
    const id = `${kind}:${cameraId ?? 'system'}`
    const now = new Date().toISOString()
    const existing = this.alerts.get(id)
    const alert: LocalAlert = existing
      ? { ...existing, message: sanitizeSidecarOutput(message), count: existing.count + 1, lastOccurredAt: now }
      : { id, kind, cameraId, message: sanitizeSidecarOutput(message), count: 1, firstOccurredAt: now, lastOccurredAt: now }
    this.alerts.set(id, alert)
    this.persist()
    return alert
  }

  list(): LocalAlert[] {
    return [...this.alerts.values()].sort((a, b) => b.lastOccurredAt.localeCompare(a.lastOccurredAt))
  }

  dismiss(id: string): boolean {
    const dismissed = this.alerts.delete(id)
    if (dismissed) this.persist()
    return dismissed
  }

  diagnosticReport(): { generatedAt: string; alerts: LocalAlert[] } {
    return { generatedAt: new Date().toISOString(), alerts: this.list().map((alert) => ({ ...alert, message: sanitizeSidecarOutput(alert.message) })) }
  }
}
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { sanitizeSidecarOutput } from '../logging/sanitizer.js'
