import type { CameraStatus, RecordingStatus } from '../shared/contracts.js'

const CAMERA_STATUS_LABEL: Record<CameraStatus, string> = {
  disabled: 'Desativada',
  disconnected: 'Desconectada',
  connecting: 'Conectando',
  connected: 'Conectada',
  reconnecting: 'Reconectando',
  auth_error: 'Erro de autenticação',
  network_error: 'Erro de rede',
  media_error: 'Erro de mídia',
  codec_error: 'Codec incompatível',
  unavailable: 'Indisponível',
}

const CAMERA_STATUS_TONE: Record<CameraStatus, 'ok' | 'warn' | 'err' | 'info' | 'muted'> = {
  disabled: 'muted',
  disconnected: 'muted',
  connecting: 'info',
  connected: 'ok',
  reconnecting: 'warn',
  auth_error: 'err',
  network_error: 'err',
  media_error: 'err',
  codec_error: 'err',
  unavailable: 'muted',
}

const RECORDING_STATUS_LABEL: Record<RecordingStatus, string> = {
  idle: 'Não gravando',
  starting: 'Iniciando',
  recording: 'Gravando',
  stopping: 'Parando',
  completed: 'Completa',
  interrupted: 'Interrompida',
  failed: 'Falha',
}

export function cameraStatusLabel(status: CameraStatus): string {
  return CAMERA_STATUS_LABEL[status]!
}

export function cameraStatusTone(status: CameraStatus): 'ok' | 'warn' | 'err' | 'info' | 'muted' {
  return CAMERA_STATUS_TONE[status]!
}

export function recordingStatusLabel(status: RecordingStatus): string {
  return RECORDING_STATUS_LABEL[status]!
}
