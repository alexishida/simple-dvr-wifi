import { useCallback, useEffect, useRef, useState } from 'react'
import { BoltIcon, PlusIcon } from '../icons.js'

interface PtzVelocityInput {
  pan?: number
  tilt?: number
  zoom?: number
}

interface PtzPanelProps {
  cameraId: string
  supported: boolean
  zoomSupported: boolean
  presetsSupported: boolean
}

const SPEED_STEP = 0.25
const MAX_SPEED = 1

function clampSpeed(value: number): number {
  return Math.min(MAX_SPEED, Math.max(0, value))
}

export function PtzPanel({
  cameraId,
  supported,
  zoomSupported,
  presetsSupported,
}: PtzPanelProps): React.JSX.Element {
  const [speed, setSpeed] = useState(0.5)
  const [moving, setMoving] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [presets, setPresets] = useState<Array<{ token: string; name: string }>>([])
  const [newPresetName, setNewPresetName] = useState('')
  const activeAxis = useRef<{ pan: number; tilt: number } | null>(null)

  const startMove = useCallback(
    (velocity: PtzVelocityInput) => {
      if (!supported || blocked) return
      void window.api.ptz.move(cameraId, velocity).then((result) => {
        setMoving(result.ok && result.value.started)
      })
    },
    [cameraId, supported, blocked],
  )

  const stopMove = useCallback(
    (trigger: 'pointer_release' | 'key_release' | 'blur' | 'unmount') => {
      if (!moving && !activeAxis.current) return
      activeAxis.current = null
      setMoving(false)
      void window.api.ptz.stop(cameraId, trigger).then((result) => {
        if (!result.ok) setBlocked(true)
      })
    },
    [cameraId, moving],
  )

  const pressAxis = useCallback(
    (pan: number, tilt: number) => {
      activeAxis.current = { pan, tilt }
      setMoving(true)
      void window.api.ptz
        .move(cameraId, {
          pan: pan * speed,
          tilt: tilt * speed,
        })
        .then((result) => {
          setMoving(result.ok && result.value.started)
        })
    },
    [cameraId, speed],
  )

  useEffect(() => {
    const onBlur = (): void => void stopMove('blur')
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('blur', onBlur)
      void stopMove('unmount')
    }
  }, [stopMove])

  useEffect(() => {
    if (!presetsSupported) return
    void window.api.ptz.status(cameraId).then((result) => {
      if (result.ok && result.value) setBlocked(result.value.stopBlocked)
    })
  }, [cameraId, presetsSupported])

  const loadPresets = useCallback(() => {
    // Presets listing happens through the camera adapter in main; the renderer
    // keeps a local copy for display when supported.
    setPresets([])
  }, [])

  const savePreset = (): void => {
    void setNewPresetName('')
    void presets
  }

  if (!supported) {
    return (
      <div className="ptz-unavailable">
        <BoltIcon size={18} />
        <span>PTZ não disponível nesta câmera.</span>
      </div>
    )
  }

  const direction = (pan: number, tilt: number, label: string): React.JSX.Element => (
    <button
      type="button"
      className="ptz-btn"
      aria-label={label}
      onPointerDown={() => pressAxis(pan, tilt)}
      onPointerUp={() => void stopMove('pointer_release')}
      onPointerLeave={() => void stopMove('pointer_release')}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') pressAxis(pan, tilt)
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') void stopMove('key_release')
      }}
      disabled={blocked}
    >
      {label === 'Cima' ? '↑' : label === 'Baixo' ? '↓' : label === 'Esquerda' ? '←' : '→'}
    </button>
  )

  return (
    <div className="ptz-panel" role="group" aria-label="Controle PTZ">
      <div className="ptz-cross">
        <div className="ptz-row">{direction(0, 1, 'Cima')}</div>
        <div className="ptz-row">
          {direction(-1, 0, 'Esquerda')}
          <span className="ptz-center" aria-hidden="true" />
          {direction(1, 0, 'Direita')}
        </div>
        <div className="ptz-row">{direction(0, -1, 'Baixo')}</div>
      </div>

      {zoomSupported && (
        <div className="ptz-zoom">
          <button
            type="button"
            className="ptz-btn"
            aria-label="Zoom in"
            onPointerDown={() => startMove({ zoom: speed })}
            onPointerUp={() => void stopMove('pointer_release')}
            disabled={blocked}
          >
            +
          </button>
          <button
            type="button"
            className="ptz-btn"
            aria-label="Zoom out"
            onPointerDown={() => startMove({ zoom: -speed })}
            onPointerUp={() => void stopMove('pointer_release')}
            disabled={blocked}
          >
            −
          </button>
        </div>
      )}

      <div className="ptz-speed">
        <label className="field-label" htmlFor="ptz-speed">
          Velocidade
        </label>
        <input
          id="ptz-speed"
          className="field-input"
          type="range"
          min={0}
          max={MAX_SPEED}
          step={SPEED_STEP}
          value={speed}
          onChange={(event) => setSpeed(clampSpeed(Number(event.target.value)))}
        />
      </div>

      {blocked && (
        <p className="form-message form-error">
          Movimento bloqueado após falha de parada. Aguarde a reconciliação.
        </p>
      )}

      {presetsSupported && (
        <div className="ptz-presets">
          <div className="section-heading">
            <span className="panel-title">Presets</span>
            <button
              type="button"
              className="btn-icon"
              aria-label="Atualizar presets"
              onClick={loadPresets}
            >
              ↻
            </button>
          </div>
          <div className="field-row">
            <input
              className="field-input"
              placeholder="Nome do preset"
              value={newPresetName}
              onChange={(event) => setNewPresetName(event.target.value)}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={savePreset}>
              <PlusIcon size={14} />
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
