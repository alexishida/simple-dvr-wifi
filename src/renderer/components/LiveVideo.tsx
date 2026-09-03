import { useEffect, useRef, useState } from 'react'
import { CameraIcon } from '../icons.js'

interface LiveVideoProps {
  cameraId: string
  cameraName: string
  profile: 'main' | 'sub'
  videoRef?: React.RefObject<HTMLVideoElement | null>
}

type PlayerState = 'connecting' | 'playing' | 'error'
const pendingReleases = new Map<string, Promise<unknown>>()

function waitForIceGathering(peer: RTCPeerConnection, signal: AbortSignal): Promise<void> {
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

export function LiveVideo({
  cameraId,
  cameraName,
  profile,
  videoRef: externalVideoRef,
}: LiveVideoProps): React.JSX.Element {
  const internalVideoRef = useRef<HTMLVideoElement>(null)
  const videoRef = externalVideoRef ?? internalVideoRef
  const [state, setState] = useState<PlayerState>('connecting')
  const [message, setMessage] = useState('Conectando ao stream…')
  const [retryAttempt, setRetryAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let peer: RTCPeerConnection | null = null
    let sessionUrl: string | null = null
    let bearerToken: string | null = null
    let mediaRequested = false
    const abortController = new AbortController()

    const connect = async (): Promise<void> => {
      setState('connecting')
      setMessage('Conectando ao stream…')

      await pendingReleases.get(cameraId)
      if (cancelled) return
      const acquired = await window.api.media.acquire({ cameraId, profile })
      mediaRequested = true
      if (cancelled) return
      if (!acquired.ok || acquired.value.state !== 'running') {
        throw new Error(
          acquired.ok
            ? acquired.value.error || 'O gateway de vídeo não iniciou.'
            : acquired.error.message,
        )
      }

      const endpoint = await window.api.media.whepEndpoint(cameraId, profile)
      if (cancelled) return
      if (!endpoint.ok || !endpoint.value) {
        throw new Error(endpoint.ok ? 'Endpoint WHEP indisponível.' : endpoint.error.message)
      }

      bearerToken = endpoint.value.token
      peer = new RTCPeerConnection({ iceServers: [] })
      peer.addTransceiver('video', { direction: 'recvonly' })
      peer.addTransceiver('audio', { direction: 'recvonly' })
      peer.addEventListener('track', (event) => {
        if (cancelled || !videoRef.current) return
        videoRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track])
        void videoRef.current.play().catch(() => undefined)
      })
      peer.addEventListener('connectionstatechange', () => {
        if (cancelled || !peer) return
        if (peer.connectionState === 'connected') {
          setState('playing')
        } else if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          setState('error')
          setMessage('A conexão de vídeo foi interrompida.')
        }
      })

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await waitForIceGathering(peer, abortController.signal)
      if (!peer.localDescription?.sdp) throw new Error('Não foi possível criar a oferta WebRTC.')

      const response = await fetch(endpoint.value.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/sdp',
          Accept: 'application/sdp',
        },
        body: peer.localDescription.sdp,
        signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(10_000)]),
      })
      if (!response.ok) throw new Error(`O stream respondeu com HTTP ${response.status}.`)

      const location = response.headers.get('Location')
      if (location) sessionUrl = new URL(location, endpoint.value.url).toString()
      const answer = await response.text()
      if (cancelled) return
      await peer.setRemoteDescription({ type: 'answer', sdp: answer })
    }

    const connectionTask = connect()
    void connectionTask.catch((error: unknown) => {
      if (cancelled) return
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir o vídeo.')
    })

    return () => {
      cancelled = true
      abortController.abort()
      peer?.close()
      if (videoRef.current) videoRef.current.srcObject = null
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
        .finally(() => {
        if (pendingReleases.get(cameraId) === release) pendingReleases.delete(cameraId)
        })
      pendingReleases.set(cameraId, release)
    }
  }, [cameraId, profile, retryAttempt])

  return (
    <div className="live-video">
      <video
        ref={videoRef}
        className="live-video-element"
        aria-label={`Vídeo ao vivo de ${cameraName}`}
        autoPlay
        muted
        playsInline
      />
      {state !== 'playing' && (
        <div className={`camera-video-placeholder live-video-status live-video-${state}`} role="status">
          <CameraIcon size={36} />
          <span>{message}</span>
          {state === 'error' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRetryAttempt((attempt) => attempt + 1)}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}
    </div>
  )
}
