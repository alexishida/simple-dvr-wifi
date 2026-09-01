import type { CameraSummary } from '../../shared/contracts.js'
import { useAppStore, type FullscreenProfile } from '../store/appStore.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { RecIcon, KeyIcon, BoltIcon } from '../icons.js'
import { recordingStatusLabel } from '../status.js'
import { LiveVideo } from '../components/LiveVideo.js'
import { PtzPanel } from '../components/PtzPanel.js'

interface FullscreenViewProps {
  camera: CameraSummary
}

export function FullscreenView({ camera }: FullscreenViewProps): React.JSX.Element {
  const profile = useAppStore((state) => state.fullscreenProfile)
  const closeFullscreen = useAppStore((state) => state.closeFullscreen)
  const setProfile = useAppStore((state) => state.setFullscreenProfile)
  const recording = camera.recordingStatus === 'recording' || camera.recordingStatus === 'starting'

  const switchProfile = (next: FullscreenProfile): void => {
    setProfile(next)
  }

  return (
    <div
      className="fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${camera.name} em tela cheia`}
    >
      <div className="fullscreen-header">
        <div className="fullscreen-title">
          <h2>{camera.name}</h2>
          <StatusBadge status={camera.status} />
        </div>
        <div className="fullscreen-actions">
          <div className="layout-switcher" role="group" aria-label="Perfil do stream">
            <button
              type="button"
              className={`layout-btn${profile === 'main' ? ' layout-btn-active' : ''}`}
              aria-pressed={profile === 'main'}
              onClick={() => switchProfile('main')}
            >
              Main
            </button>
            <button
              type="button"
              className={`layout-btn${profile === 'sub' ? ' layout-btn-active' : ''}`}
              aria-pressed={profile === 'sub'}
              onClick={() => switchProfile('sub')}
            >
              Sub
            </button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={closeFullscreen}>
            Sair da tela cheia
          </button>
        </div>
      </div>

      <div className="fullscreen-video">
        <LiveVideo cameraId={camera.id} cameraName={camera.name} profile={profile} />
        {recording && (
          <span className="rec-indicator" role="status">
            <RecIcon size={16} />
            {recordingStatusLabel(camera.recordingStatus)}
          </span>
        )}
      </div>

      {camera.supportsPtz && (
        <PtzPanel
          cameraId={camera.id}
          supported
          zoomSupported
          presetsSupported={false}
        />
      )}

      <div className="fullscreen-meta">
        <div className="camera-meta">
          {camera.hasCredential && (
            <span className="meta-chip">
              <KeyIcon size={14} />
              Credencial
            </span>
          )}
          {camera.supportsPtz && (
            <span className="meta-chip">
              <BoltIcon size={14} />
              PTZ
            </span>
          )}
        </div>
        <span className="fullscreen-host">{camera.host}</span>
      </div>
    </div>
  )
}
