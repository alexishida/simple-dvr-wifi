const MAX_SDP_LENGTH = 64 * 1024

/** Returns the first negotiated audio codec advertised by a WHEP SDP answer. */
export function audioCodecFromSdp(sdp: string): string | null {
  const audioSection = sdp
    .slice(0, MAX_SDP_LENGTH)
    .match(/(^m=audio\s+[^\r\n]*(?:\r?\n(?!m=)[^\r\n]*)*)/m)?.[1]
  if (!audioSection) return null

  const payloads = audioSection.match(/^m=audio\s+\d+\s+\S+\s+(.+)$/m)?.[1]
    ?.trim()
    .split(/\s+/)
    .filter((payload) => /^\d{1,3}$/.test(payload))
  if (!payloads?.length) return null

  for (const payload of payloads) {
    const codec = audioSection.match(
      new RegExp(`^a=rtpmap:${payload}\\s+([^/\\s]+)`, 'mi'),
    )?.[1]
    if (!codec) continue
    return codec.toUpperCase() === 'OPUS'
      ? 'Opus'
      : codec.toUpperCase()
  }
  return null
}
