import { useMemo, useState } from 'react'
import type { CameraSummary } from '../../shared/contracts.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { CameraIcon, KeyIcon, BoltIcon, RecIcon, MaximizeIcon, ImageIcon } from '../icons.js'
import { recordingStatusLabel } from '../status.js'
import { useAppStore } from '../store/appStore.js'

export type GridLayout = 1 | 4 | 9 | 16

const LAYOUT_OPTIONS: Array<{ value: GridLayout; label: string }> = [
  { value: 1, label: '1' },
  { value: 4, label: '4' },
  { value: 9, label: '9' },
  { value: 16, label: '16' },
]

interface MonitoringTileProps {
  camera: CameraSummary | null
  index: number
  onFullscreen: (camera: CameraSummary) => void
}

function MonitoringTile({ camera, index, onFullscreen }: MonitoringTileProps): React.JSX.Element {
  const [localRecording, setLocalRecording] = useState(false)
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null)

  if (!camera) {
    return (
      <div className="monitor-tile monitor-tile-empty" role="listitem">
        <span className="tile-index">{index + 1}</span>
      </div>
    )
  }

  const recording =
    localRecording ||
    camera.recordingStatus === 'recording' ||
    camera.recordingStatus === 'starting'

  const toggleRecording = (): void => {
    if (localRecording) {
      void window.api.recordings.stop(camera.id).then(() => setLocalRecording(false))
    } else {
      void window.api.recordings.start(camera.id).then((result) => {
        if (result.ok && result.value.writeAllowed) setLocalRecording(true)
        else setSnapshotStatus('Sem espaço para gravar.')
      })
    }
  }

  const captureSnapshot = (): void => {
    void window.api.snapshots.capture({ cameraId: camera.id }).then((result) => {
      setSnapshotStatus(result.ok ? 'Snapshot salvo' : 'Falha no snapshot')
      setTimeout(() => setSnapshotStatus(null), 2000)
    })
  }

  return (
    <article className="monitor-tile" role="listitem" aria-label={`Vídeo da câmera ${camera.name}`}>
      <div className="tile-header">
        <span className="tile-name">{camera.name}</span>
        <StatusBadge status={camera.status} />
      </div>

      <div className="monitor-video">
        <div className="camera-video-placeholder">
          <CameraIcon size={36} />
          <span>Pré-visualização</span>
        </div>
        {recording && (
          <span className="rec-indicator" role="status">
            <RecIcon size={14} />
            {recordingStatusLabel(camera.recordingStatus)}
          </span>
        )}
      </div>

      <div className="tile-footer">
        <div className="camera-meta">
          {camera.hasCredential && (
            <span className="meta-chip">
              <KeyIcon size={12} />
              Credencial
            </span>
          )}
          {camera.supportsPtz && (
            <span className="meta-chip">
              <BoltIcon size={12} />
              PTZ
            </span>
          )}
        </div>
        <div className="tile-actions">
          <button
            type="button"
            className="btn-icon"
            aria-label={`Capturar snapshot de ${camera.name}`}
            onClick={captureSnapshot}
          >
            <ImageIcon size={15} />
          </button>
          <button
            type="button"
            className={`btn-icon${recording ? ' btn-icon-recording' : ''}`}
            aria-label={recording ? `Parar gravação de ${camera.name}` : `Gravar ${camera.name}`}
            onClick={toggleRecording}
          >
            <RecIcon size={15} />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={`Abrir ${camera.name} em tela cheia`}
            onClick={() => onFullscreen(camera)}
          >
            <MaximizeIcon size={16} />
          </button>
        </div>
      </div>

      {snapshotStatus && <p className="tile-feedback">{snapshotStatus}</p>}
    </article>
  )
}

interface MonitoringGridProps {
  cameras: CameraSummary[]
  onOpenFullscreen: (camera: CameraSummary, profile: 'main' | 'sub') => void
}

export function MonitoringGrid({
  cameras,
  onOpenFullscreen,
}: MonitoringGridProps): React.JSX.Element {
  const [layout, setLayout] = useState<GridLayout>(4)
  const fullscreen = useAppStore((state) => state.fullscreenCamera)

  const visible = useMemo(() => {
    const slice = cameras.slice(0, layout)
    const slots: Array<CameraSummary | null> = []
    for (let i = 0; i < layout; i++) slots.push(slice[i] ?? null)
    return slots
  }, [cameras, layout])

  return (
    <section aria-label="Monitoramento ao vivo" className="monitoring">
      <div className="section-heading">
        <h2 className="section-title">Ao vivo</h2>
        <div className="layout-switcher" role="group" aria-label="Layout do grid">
          {LAYOUT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`layout-btn${layout === option.value ? ' layout-btn-active' : ''}`}
              aria-pressed={layout === option.value}
              onClick={() => setLayout(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {cameras.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <CameraIcon size={24} />
          </span>
          <h3 className="empty-state-title">Nenhuma câmera ativa</h3>
          <p className="empty-state-text">
            Cadastre ou ative câmeras para começar o monitoramento ao vivo.
          </p>
        </div>
      ) : (
        <div className={`monitor-grid monitor-grid-${layout}`} role="list">
          {visible.map((camera, index) => (
            <MonitoringTile
              key={camera?.id ?? `slot-${index}`}
              camera={camera}
              index={index}
              onFullscreen={(cam) => {
                if (!fullscreen) onOpenFullscreen(cam, 'main')
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
