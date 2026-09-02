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

export interface CameraFormProps {
  initial?: CameraDraft;
  editingId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}
