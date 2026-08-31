import type { CameraStatus } from '../../shared/contracts.js'
import { cameraStatusLabel, cameraStatusTone } from '../status.js'

interface StatusBadgeProps {
  status: CameraStatus
}

export function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  const tone = cameraStatusTone(status)
  return (
    <span className={`status-badge status-${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {cameraStatusLabel(status)}
    </span>
  )
}
