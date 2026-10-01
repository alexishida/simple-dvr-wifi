import type { RecordingSegmentRecord } from '../shared/database.js'

export const MAX_SYNCHRONIZED_CAMERAS = 4

export interface SynchronizedSegment {
  index: number
  offsetSeconds: number
}

export function segmentAt(
  segments: RecordingSegmentRecord[],
  timestampMs: number,
): SynchronizedSegment | null {
  for (const [index, segment] of segments.entries()) {
    const startedAt = Date.parse(segment.startedAt)
    const endedAt = Date.parse(segment.endedAt ?? segment.startedAt)
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) continue
    if (timestampMs >= startedAt && timestampMs <= endedAt) {
      return { index, offsetSeconds: Math.max(0, (timestampMs - startedAt) / 1_000) }
    }
  }
  return null
}

export function normalizeSynchronizedOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-60_000, Math.min(60_000, Math.round(value / 1_000) * 1_000))
}
