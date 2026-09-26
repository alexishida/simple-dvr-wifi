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

  report(kind: LocalAlertKind, message: string, cameraId: string | null = null): LocalAlert {
    const id = `${kind}:${cameraId ?? 'system'}`
    const now = new Date().toISOString()
    const existing = this.alerts.get(id)
    const alert: LocalAlert = existing
      ? { ...existing, message, count: existing.count + 1, lastOccurredAt: now }
      : { id, kind, cameraId, message, count: 1, firstOccurredAt: now, lastOccurredAt: now }
    this.alerts.set(id, alert)
    return alert
  }

  list(): LocalAlert[] {
    return [...this.alerts.values()].sort((a, b) => b.lastOccurredAt.localeCompare(a.lastOccurredAt))
  }

  dismiss(id: string): boolean {
    return this.alerts.delete(id)
  }
}
