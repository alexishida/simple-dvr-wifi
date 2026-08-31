import type { CameraSummary } from '../../shared/contracts.js'

export interface CameraDraft {
  name: string
  host: string
  port?: number | null
  rtspUrl?: string | null
  onvifUrl?: string | null
  snapshotUri?: string | null
  username?: string | null
  password?: string | null
  allowDuplicate?: boolean
}

export interface CameraListViewProps {
  cameras: CameraSummary[]
  onRefresh: () => void
  onNavigateToDiscovery: () => void
}

export interface CameraFormProps {
  initial?: CameraDraft
  editingId?: string | null
  onSaved: () => void
  onCancel: () => void
}
