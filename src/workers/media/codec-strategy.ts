export type CodecName = 'H264' | 'H265' | 'MJPEG' | 'unknown'

export type CodecStrategy = 'direct' | 'remux' | 'transcode' | 'incompatible'

export interface CodecDecision {
  strategy: CodecStrategy
  reason: string
  fallbackCodec: string | null
}

export interface CodecProbe {
  playerSupports: (codec: CodecName) => boolean
  h265Available: boolean
  mjpegAvailable: boolean
}

const H264_REMUX_NEEDED = false

export function decideCodecStrategy(codec: CodecName, probe: CodecProbe): CodecDecision {
  if (codec === 'H264') {
    if (probe.playerSupports('H264')) {
      return {
        strategy: H264_REMUX_NEEDED ? 'remux' : 'direct',
        reason: 'H.264 reproduzível sem conversão.',
        fallbackCodec: null,
      }
    }
    // If the player somehow lacks H264, try remux
    return {
      strategy: 'remux',
      reason: 'H.264 disponível; remux para contêiner compatível.',
      fallbackCodec: null,
    }
  }

  if (codec === 'H265') {
    if (probe.playerSupports('H265')) {
      return { strategy: 'direct', reason: 'H.265 suportado pelo player.', fallbackCodec: null }
    }
    if (probe.h265Available) {
      return {
        strategy: 'transcode',
        reason: 'H.265 não reproduzível; transcodificando para H.264.',
        fallbackCodec: 'H264',
      }
    }
    return {
      strategy: 'incompatible',
      reason: 'H.265 sem fallback licenciado disponível.',
      fallbackCodec: null,
    }
  }

  if (codec === 'MJPEG') {
    if (probe.mjpegAvailable) {
      return {
        strategy: 'transcode',
        reason: 'MJPEG convertido para H.264.',
        fallbackCodec: 'H264',
      }
    }
    return {
      strategy: 'incompatible',
      reason: 'MJPEG sem conversão disponível.',
      fallbackCodec: null,
    }
  }

  return { strategy: 'incompatible', reason: 'Codec desconhecido.', fallbackCodec: null }
}

export function defaultCodecProbe(): CodecProbe {
  return {
    playerSupports: (codec) => codec === 'H264',
    h265Available: false,
    mjpegAvailable: false,
  }
}
