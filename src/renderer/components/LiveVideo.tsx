import { memo, useEffect, useRef, useState } from 'react'
import { CameraIcon, VolumeIcon, VolumeMutedIcon, WifiIcon } from '../icons.js'
import { audioCodecFromSdp } from '../media-codecs.js'

interface LiveVideoProps {
  cameraId: string
  cameraName: string
  profile: 'main' | 'sub'
  videoRef?: React.RefObject<HTMLVideoElement | null>
}

type PlayerState = 'connecting' | 'playing' | 'error'
type AudioState = 'checking' | 'available' | 'unavailable'
const pendingReleases = new Map<string, Promise<unknown>>()
let audiblePlayer: { key: string; mute: () => void } | null = null
const AUDIO_VOLUME_KEY_PREFIX = 'simple-dvr-wifi:audio-volume:'

function savedVolume(cameraId: string): number {
  try {
    const value = Number(window.localStorage.getItem(`${AUDIO_VOLUME_KEY_PREFIX}${cameraId}`))
    return Number.isInteger(value) && value >= 0 && value <= 100 ? value : 80
  } catch {
    return 80
  }
}

function sessionKey(cameraId: string, profile: 'main' | 'sub'): string {
  return `${cameraId}:${profile}`
}

function waitForIceGathering(
  peer: RTCPeerConnection,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted)
    return Promise.reject(new DOMException('Operação cancelada.', 'AbortError'))
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Tempo esgotado ao preparar a conexão WebRTC.'))
    }, 5_000)
    const handleChange = (): void => {
      if (peer.iceGatheringState !== 'complete') return
      cleanup()
      resolve()
    }
    const handleAbort = (): void => {
      cleanup()
      reject(new DOMException('Operação cancelada.', 'AbortError'))
    }
    const cleanup = (): void => {
      window.clearTimeout(timeout)
      peer.removeEventListener('icegatheringstatechange', handleChange)
      signal.removeEventListener('abort', handleAbort)
    }
    peer.addEventListener('icegatheringstatechange', handleChange)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

export const LiveVideo = memo(function LiveVideo({
  cameraId,
  cameraName,
  profile,
  videoRef: externalVideoRef,
}: LiveVideoProps): React.JSX.Element {
  const internalVideoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = externalVideoRef ?? internalVideoRef
  const [state, setState] = useState<PlayerState>('connecting')
  const [message, setMessage] = useState('Conectando ao stream…')
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [visible, setVisible] = useState(true)
  const [hasAudio, setHasAudio] = useState(false)
  const [audioState, setAudioState] = useState<AudioState>('checking')
  const [audioCodec, setAudioCodec] = useState<string | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [volume, setVolume] = useState(() => savedVolume(cameraId))

  useEffect(() => {
    setVolume(savedVolume(cameraId))
  }, [cameraId])

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume / 100
  }, [videoRef, volume])

  useEffect(() => {
    const target = containerRef.current
    if (!target || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? true)
    }, { threshold: 0.01 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // Release only the viewer. Main keeps any recording session alive.
    let cancelled = false
    let peer: RTCPeerConnection | null = null
    let sessionUrl: string | null = null
    let bearerToken: string | null = null
    let mediaRequested = false
    let audioReceived = false
    let audioProbeTimer: number | null = null
    const abortController = new AbortController()
    const video = videoRef.current
    setHasAudio(false)
    setAudioState('checking')
    setAudioCodec(null)

    const connect = async (): Promise<void> => {
      if (!visible) return
      setState('connecting')
      setMessage('Conectando ao stream…')

      await pendingReleases.get(sessionKey(cameraId, profile))
      if (cancelled) return
      const acquired = await window.api.media.acquire({ cameraId, profile })
      mediaRequested = acquired.ok && acquired.value?.state === 'running'
      if (cancelled) return
      if (!acquired.ok || acquired.value?.state !== 'running') {
        throw new Error(
          acquired.ok
            ? acquired.value?.error || 'O gateway de vídeo não iniciou.'
            : acquired.error.message,
        )
      }

      const endpoint = await window.api.media.whepEndpoint(cameraId, profile)
      if (cancelled) return
      if (!endpoint.ok || !endpoint.value) {
        throw new Error(
          endpoint.ok ? 'Endpoint WHEP indisponível.' : endpoint.error.message,
        )
      }

      bearerToken = endpoint.value.token
      peer = new RTCPeerConnection({ iceServers: [] })
      peer.addTransceiver('video', { direction: 'recvonly' })
      peer.addTransceiver('audio', { direction: 'recvonly' })
      peer.addEventListener('track', (event) => {
        if (cancelled || !videoRef.current) return
        if (event.track.kind === 'audio') {
          audioReceived = true
          setHasAudio(true)
          setAudioState('available')
        }
        videoRef.current.srcObject =
          event.streams[0] ?? new MediaStream([event.track])
        void videoRef.current.play().catch(() => undefined)
      })
      peer.addEventListener('connectionstatechange', () => {
        if (cancelled || !peer) return
        if (peer.connectionState === 'connected') {
          setState('playing')
          audioProbeTimer = window.setTimeout(() => {
            if (!audioReceived) setAudioState('unavailable')
          }, 3_000)
        } else if (
          peer.connectionState === 'failed' ||
          peer.connectionState === 'disconnected'
        ) {
          setState('error')
          setMessage('A conexão de vídeo foi interrompida.')
        }
      })

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await waitForIceGathering(peer, abortController.signal)
      if (!peer.localDescription?.sdp)
        throw new Error('Não foi possível criar a oferta WebRTC.')

      const response = await fetch(endpoint.value.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/sdp',
          Accept: 'application/sdp',
        },
        body: peer.localDescription.sdp,
        signal: AbortSignal.any([
          abortController.signal,
          AbortSignal.timeout(10_000),
        ]),
      })
      if (!response.ok)
        throw new Error(`O stream respondeu com HTTP ${response.status}.`)

      const location = response.headers.get('Location')
      if (location)
        sessionUrl = new URL(location, endpoint.value.url).toString()
      const answer = await response.text()
      if (cancelled) return
      setAudioCodec(audioCodecFromSdp(answer))
      await peer.setRemoteDescription({ type: 'answer', sdp: answer })
    }

    const connectionTask = connect()
    void connectionTask.catch((error: unknown) => {
      if (cancelled) return
      setState('error')
      setMessage(
        error instanceof Error ? error.message : 'Falha ao abrir o vídeo.',
      )
    })

    return () => {
      cancelled = true
      abortController.abort()
      if (audioProbeTimer !== null) window.clearTimeout(audioProbeTimer)
      peer?.close()
      if (audiblePlayer?.key === sessionKey(cameraId, profile)) audiblePlayer = null
      if (video) video.srcObject = null
      const release = connectionTask
        .catch(() => undefined)
        .then(async () => {
          if (sessionUrl && bearerToken) {
            await fetch(sessionUrl, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${bearerToken}` },
              signal: AbortSignal.timeout(3_000),
            }).catch(() => undefined)
          }
          if (mediaRequested) await window.api.media.release(cameraId, profile)
        })
        .catch(() => undefined)
        .finally(() => {
          const key = sessionKey(cameraId, profile)
          if (pendingReleases.get(key) === release)
            pendingReleases.delete(key)
        })
      pendingReleases.set(sessionKey(cameraId, profile), release)
    }
  }, [cameraId, profile, retryAttempt, videoRef, visible])

  const toggleAudio = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    const video = videoRef.current
    if (!video || !hasAudio) return
    const key = sessionKey(cameraId, profile)
    if (audioEnabled) {
      video.muted = true
      if (audiblePlayer?.key === key) audiblePlayer = null
      setAudioEnabled(false)
      return
    }
    audiblePlayer?.mute()
    video.muted = false
    audiblePlayer = {
      key,
      mute: () => {
        video.muted = true
        setAudioEnabled(false)
      },
    }
    setAudioEnabled(true)
    void video.play().catch(() => undefined)
  }

  const changeVolume = (event: React.ChangeEvent<HTMLInputElement>): void => {
    event.stopPropagation()
    const next = Number(event.target.value)
    setVolume(next)
    try {
      window.localStorage.setItem(`${AUDIO_VOLUME_KEY_PREFIX}${cameraId}`, String(next))
    } catch {
      // A private browser profile can deny storage; the current session still works.
    }
  }

  return (
    <div ref={containerRef} className="live-video">
      <video
        ref={videoRef}
        className="live-video-element"
        aria-label={`Vídeo ao vivo de ${cameraName}`}
        autoPlay
        muted={!audioEnabled}
        playsInline
      />
      <div className="live-audio-controls" aria-label="Áudio da câmera" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="btn-icon" aria-label={audioEnabled ? `Silenciar áudio de ${cameraName}` : `Ativar áudio de ${cameraName}`} title={hasAudio ? (audioEnabled ? 'Silenciar áudio' : 'Ativar áudio') : 'Esta câmera não enviou áudio'} disabled={!hasAudio} onClick={toggleAudio}>
          {audioEnabled ? <VolumeIcon size={16} /> : <VolumeMutedIcon size={16} />}
        </button>
        <input aria-label={`Volume de ${cameraName}`} type="range" min="0" max="100" value={volume} disabled={!hasAudio || !audioEnabled} onChange={changeVolume} />
        {audioState === 'available' && audioCodec && <span className="live-audio-codec">Áudio: {audioCodec}</span>}
        {audioState === 'unavailable' && <span className="live-audio-unavailable" role="status">Sem áudio compatível</span>}
      </div>
      {state !== 'playing' && (
        <div
          className={`camera-video-placeholder live-video-status live-video-${state}`}
          role="status"
        >
          <CameraIcon size={36} />
          <span>{message}</span>
          {state === 'error' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRetryAttempt((attempt) => attempt + 1)}
            >
              <WifiIcon size={14} />
              Tentar novamente
            </button>
          )}
        </div>
      )}
    </div>
  )
})
