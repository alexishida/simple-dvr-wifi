import type { CameraSummary } from '../../shared/contracts.js'
import { StatusBadge } from './StatusBadge.js'
import { CameraIcon, KeyIcon, BoltIcon, RecIcon } from '../icons.js'
import { recordingStatusLabel } from '../status.js'

interface CameraCardProps {
  camera: CameraSummary
}

export function CameraCard({ camera }: CameraCardProps): React.JSX.Element {
  const recording = camera.recordingStatus === 'recording' || camera.recordingStatus === 'starting'

  return (
    <article className="camera-card">
      <div className="camera-card-top">
        <div>
          <h3 className="camera-name">{camera.name}</h3>
          <p className="camera-host">{camera.host}</p>
        </div>
        <StatusBadge status={camera.status} />
      </div>

      <div className="camera-video">
        <div className="camera-video-placeholder">
          <CameraIcon size={40} />
          <span>Pré-visualização indisponível</span>
        </div>
      </div>

      <div className="camera-footer">
        <div className="camera-meta">
          {recording && (
            <span className="meta-chip">
              <RecIcon size={14} />
              {recordingStatusLabel(camera.recordingStatus)}
            </span>
          )}
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
      </div>
    </article>
  )
}
