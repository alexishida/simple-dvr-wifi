export type MotionState = 'started' | 'ended'

export interface NormalizedMotionEvent {
  cameraId: string
  state: MotionState
  occurredAt: string
  receivedAt: string
  repeated: boolean
}

/** Keeps camera-supplied clocks bounded and suppresses repeated state changes. */
export class MotionEventNormalizer {
  private readonly previous = new Map<string, NormalizedMotionEvent>()

  normalize(input: { cameraId: string; active: boolean; occurredAt?: string | null; receivedAt?: string }): NormalizedMotionEvent | null {
    const receivedAt = input.receivedAt ?? new Date().toISOString()
    const receivedMs = Date.parse(receivedAt)
    const candidateMs = input.occurredAt ? Date.parse(input.occurredAt) : Number.NaN
    // Do not trust a camera timestamp more than five minutes away from receipt.
    const occurredAt = Number.isFinite(candidateMs) && Math.abs(candidateMs - receivedMs) <= 5 * 60_000
      ? new Date(candidateMs).toISOString() : receivedAt
    const state: MotionState = input.active ? 'started' : 'ended'
    const next = { cameraId: input.cameraId, state, occurredAt, receivedAt, repeated: false }
    const previous = this.previous.get(input.cameraId)
    if (previous?.state === state) {
      if (state === 'ended' || Math.abs(Date.parse(next.receivedAt) - Date.parse(previous.receivedAt)) < 1_000) return null
      this.previous.set(input.cameraId, next)
      return { ...next, repeated: true }
    }
    this.previous.set(input.cameraId, next)
    return next
  }

  reset(cameraId: string): void {
    this.previous.delete(cameraId)
  }

  resetAll(): void {
    this.previous.clear()
  }
}

export const MOTION_MISSING_END_TIMEOUT_MS = 10 * 60_000

export class MotionRecordingTimers {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly onTimeout: (cameraId: string, reason: 'missing-end' | 'post-event') => void,
    private readonly clock: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> = globalThis,
  ) {}

  arm(cameraId: string, reason: 'missing-end' | 'post-event', delayMs: number): void {
    this.clear(cameraId)
    const timer = this.clock.setTimeout(() => {
      this.timers.delete(cameraId)
      this.onTimeout(cameraId, reason)
    }, delayMs)
    this.timers.set(cameraId, timer)
  }

  clear(cameraId: string): void {
    const timer = this.timers.get(cameraId)
    if (timer) this.clock.clearTimeout(timer)
    this.timers.delete(cameraId)
  }

  clearAll(): void {
    for (const cameraId of this.timers.keys()) this.clear(cameraId)
  }
}

/** Extracts only explicit ONVIF motion boolean values from PullMessages XML. */
export function parseOnvifMotionNotification(xml: string): { active: boolean; occurredAt: string | null } | null {
  if (xml.length > 512 * 1024) return null
  const topic = /<[^>]*Topic[^>]*>([^<]+)</i.exec(xml)?.[1] ?? ''
  if (!/(motion|analytics)/i.test(topic)) return null
  const value = /<[^>]*(?:SimpleItem|Data)[^>]*(?:Value|value)=["'](true|false|0|1)["']/i.exec(xml)?.[1]?.toLowerCase()
  if (!value) return null
  const occurredAt = /<[^>]*(?:UtcTime|Message|tt:Message)[^>]*(?:UtcTime|utcTime)=["']([^"']+)["']/i.exec(xml)?.[1] ?? null
  return { active: value === 'true' || value === '1', occurredAt }
}

/** A PullMessages response can contain several NotificationMessage elements. */
export function parseOnvifMotionNotifications(xml: string): Array<{ active: boolean; occurredAt: string | null }> {
  if (xml.length > 512 * 1024) return []
  const notifications = [...xml.matchAll(/<(?:[\w.-]+:)?NotificationMessage\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?NotificationMessage\s*>/gi)]
  if (notifications.length === 0) {
    const single = parseOnvifMotionNotification(xml)
    return single ? [single] : []
  }
  return notifications.slice(0, 100).flatMap(([fragment]) => {
    const parsed = parseOnvifMotionNotification(fragment)
    return parsed ? [parsed] : []
  })
}
