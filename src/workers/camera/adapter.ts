export type CapabilityState = 'supported' | 'unsupported' | 'unknown' | 'error'

export interface CameraIdentity {
  manufacturer: string
  model: string
  firmwareVersion: string
  serialNumber: string
}

export interface CameraCapabilities {
  onvif: CapabilityState
  rtsp: CapabilityState
  snapshot: CapabilityState
  ptz: CapabilityState
  h264: CapabilityState
  h265: CapabilityState
  mjpeg: CapabilityState
}

export interface CameraProfileInfo {
  token: string
  name: string
  streamType: 'main' | 'sub'
  codec: string | null
  width: number | null
  height: number | null
  fps: number | null
  rtspUrl: string | null
  snapshotUri: string | null
}

export interface CameraOnvifInfo {
  identity: CameraIdentity
  capabilities: CameraCapabilities
  profiles: CameraProfileInfo[]
  deviceServiceUrl: string
  mediaServiceUrl: string | null
  snapshotUri: string | null
  ptzSupported: boolean
  rtspMainUrl: string | null
  rtspSubUrl: string | null
}

export function emptyOnvifInfo(deviceServiceUrl: string): CameraOnvifInfo {
  return {
    identity: { manufacturer: '', model: '', firmwareVersion: '', serialNumber: '' },
    capabilities: {
      onvif: 'unknown',
      rtsp: 'unknown',
      snapshot: 'unknown',
      ptz: 'unknown',
      h264: 'unknown',
      h265: 'unknown',
      mjpeg: 'unknown',
    },
    profiles: [],
    deviceServiceUrl,
    mediaServiceUrl: null,
    snapshotUri: null,
    ptzSupported: false,
    rtspMainUrl: null,
    rtspSubUrl: null,
  }
}

export interface CameraAdapter {
  detect(): Promise<CameraOnvifInfo>
}
