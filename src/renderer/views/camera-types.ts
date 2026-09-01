import type { CameraSummary } from "../../shared/contracts.js";

export interface CameraDraft {
  name: string;
  host: string;
  port?: number | null;
  epr?: string | null;
  rtspUrl?: string | null;
  rtspSubUrl?: string | null;
  onvifUrl?: string | null;
  snapshotUrl?: string | null;
  username?: string | null;
  password?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  allowDuplicate?: boolean;
}

export interface CameraListViewProps {
  cameras: CameraSummary[];
  onRefresh: () => void;
  onNavigateToDiscovery: () => void;
}

export interface CameraFormProps {
  initial?: CameraDraft;
  editingId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}
