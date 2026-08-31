import { useState } from 'react'
import type { CameraFormProps } from './camera-types.js'

export function CameraForm({
  initial,
  editingId,
  onSaved,
  onCancel,
}: CameraFormProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(initial?.port?.toString() ?? '')
  const [onvifUrl, setOnvifUrl] = useState(initial?.onvifUrl ?? '')
  const [rtspUrl, setRtspUrl] = useState(initial?.rtspUrl ?? '')
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{
    kind: 'error' | 'info' | 'success'
    text: string
  } | null>(null)
  const [duplicate, setDuplicate] = useState(false)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setMessage(null)

    if (editingId) {
      if (password) {
        const result = await window.api.cameras.updateCredentials({
          id: editingId,
          password,
          rtspPassword: password,
        })
        if (!result.ok) {
          setMessage({ kind: 'error', text: 'Não foi possível atualizar a credencial.' })
          return
        }
      }
      onSaved()
      return
    }

    const result = await window.api.cameras.create({
      name,
      host,
      port: port ? Number(port) : null,
      onvifUrl: onvifUrl || null,
      rtspUrl: rtspUrl || null,
      username: username || null,
      password: password || null,
      allowDuplicate: duplicate,
    })

    if (!result.ok) {
      setMessage({ kind: 'error', text: 'Não foi possível cadastrar a câmera.' })
      return
    }

    if (result.value.duplicate && !duplicate) {
      setDuplicate(true)
      setMessage({
        kind: 'info',
        text: 'Uma câmera similar já existe. Confirme para salvar como cadastro separado.',
      })
      return
    }

    setMessage({ kind: 'success', text: 'Câmera cadastrada com sucesso.' })
    onSaved()
  }

  return (
    <form className="camera-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="field">
        <label className="field-label" htmlFor="cam-name">
          Nome amigável
        </label>
        <input
          id="cam-name"
          className="field-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="cam-host">
            Endereço (IP ou hostname)
          </label>
          <input
            id="cam-host"
            className="field-input"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            required
            disabled={Boolean(editingId)}
          />
        </div>
        <div className="field field-narrow">
          <label className="field-label" htmlFor="cam-port">
            Porta
          </label>
          <input
            id="cam-port"
            className="field-input"
            type="number"
            min={1}
            max={65_535}
            value={port}
            onChange={(event) => setPort(event.target.value)}
            disabled={Boolean(editingId)}
          />
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="cam-onvif">
          URL ONVIF (opcional)
        </label>
        <input
          id="cam-onvif"
          className="field-input"
          placeholder="http://camera/onvif/device_service"
          value={onvifUrl}
          onChange={(event) => setOnvifUrl(event.target.value)}
          disabled={Boolean(editingId)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="cam-rtsp">
          URL RTSP (opcional)
        </label>
        <input
          id="cam-rtsp"
          className="field-input"
          placeholder="rtsp://camera/stream"
          value={rtspUrl}
          onChange={(event) => setRtspUrl(event.target.value)}
          disabled={Boolean(editingId)}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="cam-user">
            Usuário
          </label>
          <input
            id="cam-user"
            className="field-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={Boolean(editingId)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="cam-pass">
            {editingId ? 'Nova senha (deixe vazio para manter)' : 'Senha'}
          </label>
          <input
            id="cam-pass"
            className="field-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      {message && <div className={`form-message form-${message.kind}`}>{message.text}</div>}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          {editingId ? 'Salvar alterações' : duplicate ? 'Confirmar cadastro' : 'Cadastrar câmera'}
        </button>
      </div>
    </form>
  )
}
