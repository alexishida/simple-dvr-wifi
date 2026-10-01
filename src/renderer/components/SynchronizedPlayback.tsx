import { useEffect, useRef, useState } from 'react'
import type { CameraSummary } from '../../shared/contracts.js'
import type { RecordingSegmentRecord } from '../../shared/database.js'
import { CloseIcon, RecIcon, VideoIcon, VolumeIcon } from '../icons.js'
import {
  MAX_SYNCHRONIZED_CAMERAS,
  normalizeSynchronizedOffset,
  segmentAt,
} from '../sync-playback.js'

type SyncEntry = {
  camera: CameraSummary
  recordingId: string | null
  segments: RecordingSegmentRecord[]
  message: string | null
}

export function SynchronizedPlayback({
  anchorAt,
  cameras,
  onClose,
}: {
  anchorAt: string
  cameras: CameraSummary[]
  onClose: () => void
}): React.JSX.Element {
  const anchorMs = Date.parse(anchorAt)
  const [entries, setEntries] = useState<SyncEntry[]>([])
  const [offsets, setOffsets] = useState<Record<string, number>>({})
  const [playing, setPlaying] = useState(false)
  const [audibleCameraId, setAudibleCameraId] = useState<string | null>(null)
  const videos = useRef(new Map<string, HTMLVideoElement>())
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let active = true
    const startAt = new Date(anchorMs).toISOString()
    const endAt = new Date(anchorMs + 60_000).toISOString()
    void Promise.all(cameras.slice(0, MAX_SYNCHRONIZED_CAMERAS).map(async (camera) => {
      const recordings = await window.api.library.recordings({ cameraId: camera.id, startAt, endAt })
      if (!recordings.ok) return { camera, recordingId: null, segments: [], message: recordings.error.message }
      const recording = recordings.value.find((item) => item.path) ?? null
      if (!recording) return { camera, recordingId: null, segments: [], message: 'Sem vídeo neste horário.' }
      const segments = await window.api.library.recordingSegments(recording.id)
      if (!segments.ok) return { camera, recordingId: null, segments: [], message: segments.error.message }
      return { camera, recordingId: recording.id, segments: segments.value, message: null }
    })).then((loaded) => { if (active) setEntries(loaded) }).catch(() => {
      if (active) setEntries(cameras.slice(0, MAX_SYNCHRONIZED_CAMERAS).map((camera) => ({ camera, recordingId: null, segments: [], message: 'Não foi possível carregar a gravação.' })))
    })
    queueMicrotask(() => closeRef.current?.focus())
    return () => { active = false }
  }, [anchorAt, anchorMs, cameras])

  useEffect(() => {
    if (audibleCameraId && entries.some((entry) => entry.camera.id === audibleCameraId && entry.segments.length > 0)) return
    // Keep synchronized playback silent until the user deliberately selects a source.
    setAudibleCameraId(null)
  }, [audibleCameraId, entries])

  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])

  const targetFor = (entry: SyncEntry) => anchorMs + (offsets[entry.camera.id] ?? 0)
  const pauseAll = (): void => {
    for (const video of videos.current.values()) video.pause()
    setPlaying(false)
  }
  const playAll = (): void => {
    for (const video of videos.current.values()) void video.play().catch(() => undefined)
    setPlaying(true)
  }
  const synchronizeFrom = (source: HTMLVideoElement): void => {
    const elapsed = source.currentTime
    for (const [cameraId, video] of videos.current) {
      if (video === source) continue
      const entry = entries.find((item) => item.camera.id === cameraId)
      if (!entry) continue
      const segment = segmentAt(entry.segments, targetFor(entry))
      if (segment && Math.abs(video.currentTime - elapsed) > 0.5) {
        video.currentTime = Math.min(video.duration || elapsed, elapsed)
      }
    }
  }

  return (
    <div className="modal-backdrop recording-player-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal synchronized-player-modal" role="dialog" aria-modal="true" aria-labelledby="synchronized-player-title">
        <header className="recording-player-header">
          <div>
            <h3 id="synchronized-player-title">Reprodução sincronizada</h3>
            <p>{new Date(anchorAt).toLocaleString('pt-BR')} · até {MAX_SYNCHRONIZED_CAMERAS} câmeras</p>
          </div>
          <button type="button" className="btn btn-icon recording-player-close" ref={closeRef} aria-label="Fechar reprodução sincronizada" title="Fechar" onClick={() => { pauseAll(); onClose() }}><CloseIcon size={18} /></button>
        </header>
        <p className="field-hint">Ajuste cada relógio quando necessário. Um painel sem vídeo indica uma lacuna real; a sincronização não preenche trechos ausentes.</p>
        <label className="synchronized-audio-source" htmlFor="synchronized-audio-source">
          <VolumeIcon size={16} />
          Ouvir câmera
          <select
            id="synchronized-audio-source"
            className="field-input"
            value={audibleCameraId ?? ''}
            onChange={(event) => setAudibleCameraId(event.target.value || null)}
          >
            <option value="">Nenhuma (silenciado)</option>
            {entries.filter((entry) => entry.segments.length > 0).map((entry) => (
              <option key={entry.camera.id} value={entry.camera.id}>{entry.camera.name}</option>
            ))}
          </select>
        </label>
        <div className="synchronized-player-grid">
          {entries.length === 0 ? <p role="status">Carregando gravações…</p> : entries.map((entry) => {
            const segment = segmentAt(entry.segments, targetFor(entry))
            const source = entry.recordingId && segment ? `app://renderer/media/recordings/${encodeURIComponent(entry.recordingId)}/${segment.index}` : null
            return <article className="synchronized-player-tile" key={entry.camera.id}>
              <h4><VideoIcon size={16} /> {entry.camera.name}</h4>
              {source ? <video ref={(video) => { if (video) videos.current.set(entry.camera.id, video); else videos.current.delete(entry.camera.id) }} src={source} muted={entry.camera.id !== audibleCameraId} playsInline onLoadedMetadata={(event) => { event.currentTarget.currentTime = segment?.offsetSeconds ?? 0; if (playing) void event.currentTarget.play().catch(() => undefined) }} onTimeUpdate={(event) => entry.camera.id === entries[0]?.camera.id && synchronizeFrom(event.currentTarget)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} controls={entry.camera.id === entries[0]?.camera.id} /> : <p className="synchronized-player-gap"><RecIcon size={20} /> {entry.message ?? 'Sem vídeo neste horário.'}</p>}
              <label>Compensar relógio
                <input type="range" min="-60" max="60" step="1" value={(offsets[entry.camera.id] ?? 0) / 1_000} onChange={(event) => setOffsets((current) => ({ ...current, [entry.camera.id]: normalizeSynchronizedOffset(Number(event.target.value) * 1_000) }))} />
                <span>{((offsets[entry.camera.id] ?? 0) / 1_000).toLocaleString('pt-BR', { signDisplay: 'always' })} s</span>
              </label>
            </article>
          })}
        </div>
        <div className="recording-player-actions">
          <button type="button" className="btn btn-primary" disabled={entries.every((entry) => !segmentAt(entry.segments, targetFor(entry)))} onClick={playing ? pauseAll : playAll}><RecIcon size={16} /> {playing ? 'Pausar todos' : 'Reproduzir todos'}</button>
        </div>
      </section>
    </div>
  )
}
