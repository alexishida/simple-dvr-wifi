export interface RetentionCandidate {
  id: string
  timestamp: number
  bytes: number
  protected: boolean
  active: boolean
}

export function selectRetentionCandidates(
  candidates: RetentionCandidate[],
  options: { now: number; maxAgeDays: number; maxBytes: number },
): string[] {
  let totalBytes = candidates.reduce((total, item) => total + item.bytes, 0)
  const threshold = options.maxAgeDays > 0 ? options.now - options.maxAgeDays * 86_400_000 : null
  const selected: string[] = []
  for (const item of [...candidates].sort((a, b) => a.timestamp - b.timestamp)) {
    if (item.protected || item.active) continue
    const expired = threshold !== null && item.timestamp < threshold
    const oversized = options.maxBytes > 0 && totalBytes > options.maxBytes
    if (!expired && !oversized) continue
    selected.push(item.id)
    totalBytes -= item.bytes
  }
  return selected
}
