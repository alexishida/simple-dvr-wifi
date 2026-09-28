export interface SdCardCamera {
  id: string;
  name: string;
  supported: boolean;
  detail: string;
}

export interface SdCardRecording {
  id: string;
  cameraId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  bytes: number;
  downloaded: boolean;
}
