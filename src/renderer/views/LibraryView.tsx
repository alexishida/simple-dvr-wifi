import { useEffect, useMemo, useState } from 'react'
import type { CameraSummary } from '../../shared/contracts.js'
import type { RecordingRecord, SnapshotRecord } from '../../shared/database.js'
import { ImageIcon, RecIcon } from '../icons.js'

type RecordingLibraryItem = RecordingRecord & { path: string | null }

interface LibraryViewProps {
  cameras: CameraSummary[]
  mode: 'snapshots' | 'recordings'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return 'em andamento'
  const seconds = Math.max(0, Math.round(durationMs / 1_000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function LibraryView({ cameras, mode }: LibraryViewProps): React.JSX.Element {
  const [selectedCamera, setSelectedCamera] = useState('')
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([])
  const [recordings, setRecordings] = useState<RecordingLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const cameraId = selectedCamera || undefined
    const request =
      mode === 'snapshots'
        ? window.api.library.snapshots(cameraId)
        : window.api.library.recordings(cameraId)
    void request.then((result) => {
      if (!active) return
      if (!result.ok) {
        setError(result.error.message)
      } else if (mode === 'snapshots') {
        setSnapshots(result.value as SnapshotRecord[])
      } else {
        setRecordings(result.value as RecordingLibraryItem[])
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [mode, selectedCamera])

  const cameraNames = useMemo(
    () => new Map(cameras.map((camera) => [camera.id, camera.name])),
    [cameras],
  )
  const items = mode === 'snapshots' ? snapshots : recordings
  const Icon = mode === 'snapshots' ? ImageIcon : RecIcon
  const title = mode === 'snapshots' ? 'Snapshots' : 'Gravações'

  return (
    <div className="panel">
      <div className="section-heading">
        <h2 className="section-title">{title}</h2>
        <div className="field field-narrow">
          <select
            className="field-input"
            aria-label="Filtrar por câmera"
            value={selectedCamera}
            onChange={(event) => setSelectedCamera(event.target.value)}
          >
            <option value="">Todas as câmeras</option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>{camera.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="form-message form-error">{error}</p>}
      {loading ? (
        <p className="library-loading" role="status">Carregando biblioteca…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon"><Icon size={24} /></span>
          <h3 className="empty-state-title">Nenhum item encontrado</h3>
          <p className="empty-state-text">
            {mode === 'snapshots'
              ? 'Os snapshots capturados aparecerão aqui.'
              : 'As gravações iniciadas pelo monitoramento aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <ul className="library-list">
          {mode === 'snapshots'
            ? snapshots.map((snapshot) => (
                <li key={snapshot.id} className="library-item">
                  <span className="library-item-icon"><ImageIcon size={18} /></span>
                  <div className="library-item-body">
                    <span className="library-item-name">
                      {cameraNames.get(snapshot.cameraId) ?? 'Câmera removida'}
                    </span>
                    <span className="library-item-meta">{formatDate(snapshot.capturedAt)}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void window.api.library.openSnapshot(snapshot.path)}
                  >
                    Abrir arquivo
                  </button>
                </li>
              ))
            : recordings.map((recording) => (
                <li key={recording.id} className="library-item">
                  <span className="library-item-icon"><RecIcon size={18} /></span>
                  <div className="library-item-body">
                    <span className="library-item-name">
                      {cameraNames.get(recording.cameraId) ?? 'Câmera removida'}
                    </span>
                    <span className="library-item-meta">
                      {formatDate(recording.startedAt)} · {formatDuration(recording.durationMs)}
                    </span>
                  </div>
                  {recording.path ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void window.api.library.openRecording(recording.path!)}
                    >
                      Reproduzir
                    </button>
                  ) : (
                    <span className="meta-chip">{recording.status}</span>
                  )}
                </li>
              ))}
        </ul>
      )}
    </div>
  )
}
