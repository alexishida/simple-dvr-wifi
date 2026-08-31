export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

export interface PersistentIssue {
  fingerprint: string
  message: string
  count: number
  firstSeen: string
  lastSeen: string
}

export interface NotificationBus {
  onToast(callback: (toast: Toast) => void): void
  showToast(kind: ToastKind, message: string): void
  onIssues(callback: (issues: PersistentIssue[]) => void): void
  addDiagnostic(input: { code: string; message: string; fingerprint: string }): PersistentIssue
}

export function fingerprintOf(code: string, message: string): string {
  let hash = 0
  const input = `${code}|${message}`
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export class InMemoryNotificationBus implements NotificationBus {
  private readonly toastListeners = new Set<(toast: Toast) => void>()
  private readonly issueListeners = new Set<(issues: PersistentIssue[]) => void>()
  private readonly issues = new Map<string, PersistentIssue>()
  private nextToastId = 1

  onToast(callback: (toast: Toast) => void): void {
    this.toastListeners.add(callback)
  }

  showToast(kind: ToastKind, message: string): void {
    const toast: Toast = { id: `t${this.nextToastId++}`, kind, message }
    for (const listener of this.toastListeners) listener(toast)
  }

  onIssues(callback: (issues: PersistentIssue[]) => void): void {
    this.issueListeners.add(callback)
    callback([...this.issues.values()])
  }

  addDiagnostic(input: { code: string; message: string; fingerprint: string }): PersistentIssue {
    const now = new Date().toISOString()
    const existing = this.issues.get(input.fingerprint)
    if (existing) {
      existing.count++
      existing.lastSeen = now
      for (const listener of this.issueListeners) listener([...this.issues.values()])
      return existing
    }
    const issue: PersistentIssue = {
      fingerprint: input.fingerprint,
      message: input.message,
      count: 1,
      firstSeen: now,
      lastSeen: now,
    }
    this.issues.set(input.fingerprint, issue)
    for (const listener of this.issueListeners) listener([...this.issues.values()])
    return issue
  }
}

export function consolidateDiagnostics(
  diagnostics: Array<{ code: string; message: string; fingerprint?: string }>,
): PersistentIssue[] {
  const bus = new InMemoryNotificationBus()
  for (const d of diagnostics) {
    const fingerprint = d.fingerprint ?? fingerprintOf(d.code, d.message)
    bus.addDiagnostic({ code: d.code, message: d.message, fingerprint })
  }
  return [...bus['issues'].values()]
}
