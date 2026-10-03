import type { CameraRecord } from '../../shared/database.js'
import type { DecryptedCredential } from './credentials.js'

/** Stored secrets may only be tested against the endpoint already registered for that service. */
export async function cameraTestCredentials(input: {
  camera: CameraRecord | null
  service: 'onvif' | 'rtsp'
  url: string
  username: string | null
  password: string | null
  load: (cameraId: string, service: 'onvif' | 'rtsp') => Promise<DecryptedCredential | null>
}): Promise<{ username: string | null; password: string | null }> {
  if (input.password || !input.camera) {
    return { username: input.username, password: input.password }
  }
  const endpoint = input.camera.endpoints.find((entry) => entry.service === input.service)
  if (!endpoint || new URL(endpoint.url).href !== new URL(input.url).href) {
    throw new Error('O endereço do serviço mudou. Digite a senha para testar este endereço.')
  }
  const stored = await input.load(input.camera.id, input.service)
  if (!stored) throw new Error('Não há senha salva para este serviço. Preencha o campo Senha da câmera para testar.')
  if (input.username && input.username !== stored.username) {
    throw new Error('O usuário mudou. Digite a senha para testar com este usuário.')
  }
  return stored
}
