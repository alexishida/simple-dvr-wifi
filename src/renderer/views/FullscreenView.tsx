import { useEffect, useRef, useState } from 'react'
import type { CameraSummary } from '../../shared/contracts.js'
import { useAppStore } from '../store/appStore.js'
import { StatusBadge } from '../components/StatusBadge.js'
import {
  ActivityIcon,
  BoltIcon,
  CameraIcon,
  ChevronLeftIcon,
  KeyIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoveIcon,
  RecIcon,
  SettingsIcon,
  VideoIcon,
} from '../icons.js'
import { recordingStatusLabel } from '../status.js'
import { LiveVideo } from '../components/LiveVideo.js'
import { PtzPanel } from '../components/PtzPanel.js'

interface FullscreenViewProps {
  camera: CameraSummary
}

export function FullscreenView({
  camera,
}: FullscreenViewProps): React.JSX.Element {
  const profile = useAppStore((state) => state.fullscreenProfile)
  const closeFullscreen = useAppStore((state) => state.closeFullscreen)
  const setProfile = useAppStore((state) => state.setFullscreenProfile)
  const [controlsOpen, setControlsOpen] = useState(true)
  const [fillVideo, setFillVideo] = useState(false)
  const backRef = useRef<HTMLButtonElement>(null)
  const recording =
    camera.recordingStatus === 'recording' ||
    camera.recordingStatus === 'starting'
  const ptzAvailable = camera.active && camera.supportsPtz

  useEffect(() => {
    backRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      closeFullscreen()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeFullscreen])

  return (
    <div
      className="fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-camera-name"
    >
      <header className="fullscreen-header">
        <button
          ref={backRef}
          type="button"
          className="btn btn-secondary fullscreen-back"
          onClick={closeFullscreen}
          aria-label="Voltar à Live"
          title="Voltar à Live (Esc)"
        >
          <ChevronLeftIcon size={18} />
          <span>Voltar à Live</span>
        </button>
        <div className="fullscreen-heading">
          <span className="fullscreen-eyebrow">
            <CameraIcon size={13} /> Monitoramento
          </span>
          <h1 id="fullscreen-camera-name" title={camera.name}>
            {camera.name}
          </h1>
        </div>
        <div className="fullscreen-connection">
          <StatusBadge status={camera.status} />
        </div>
      </header>

      <div
        className={`fullscreen-workspace${controlsOpen ? '' : ' fullscreen-workspace-focus'}`}
      >
        <main
          className="fullscreen-stage"
          aria-label="Vídeo e controles de exibição"
        >
          <div
            className={`fullscreen-video${fillVideo ? ' fullscreen-video-fill' : ''}`}
          >
            <LiveVideo
              cameraId={camera.id}
              cameraName={camera.name}
              profile={profile}
            />
            {recording && (
              <span className="fullscreen-recording" role="status">
                <RecIcon size={15} />
                {recordingStatusLabel(camera.recordingStatus)}
              </span>
            )}
          </div>

          <footer className="fullscreen-toolbar">
            <div
              className="fullscreen-quality"
              role="group"
              aria-label="Qualidade do vídeo"
            >
              <button
                type="button"
                className={`fullscreen-quality-option${profile === 'main' ? ' is-active' : ''}`}
                aria-pressed={profile === 'main'}
                onClick={() => setProfile('main')}
                title="Usar o stream principal da câmera"
              >
                <VideoIcon size={17} />
                <span>Principal</span>
              </button>
              <button
                type="button"
                className={`fullscreen-quality-option${profile === 'sub' ? ' is-active' : ''}`}
                aria-pressed={profile === 'sub'}
                onClick={() => setProfile('sub')}
                title="Usar o stream secundário, mais leve"
              >
                <BoltIcon size={17} />
                <span>Leve</span>
              </button>
            </div>
            <div className="fullscreen-tools">
              <button
                type="button"
                className="btn btn-secondary"
                aria-pressed={fillVideo}
                onClick={() => setFillVideo((value) => !value)}
                title={
                  fillVideo
                    ? 'Exibir a imagem inteira'
                    : 'Preencher a área de vídeo (recorta as bordas)'
                }
              >
                {fillVideo ? (
                  <MinimizeIcon size={17} />
                ) : (
                  <MaximizeIcon size={17} />
                )}
                <span>{fillVideo ? 'Imagem inteira' : 'Preencher'}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary fullscreen-controls-toggle"
                aria-expanded={controlsOpen}
                aria-controls="fullscreen-controls"
                onClick={() => setControlsOpen((value) => !value)}
                title={
                  controlsOpen
                    ? 'Recolher controles e ampliar o vídeo'
                    : 'Mostrar controles da câmera'
                }
              >
                <SettingsIcon size={17} />
                <span>Controles</span>
              </button>
            </div>
          </footer>
        </main>

        {controlsOpen && (
          <aside
            className="fullscreen-controls"
            id="fullscreen-controls"
            aria-label="Controles da câmera"
          >
            <div className="fullscreen-panel-heading">
              <span className="fullscreen-panel-icon">
                <MoveIcon size={20} />
              </span>
              <div>
                <h2>Controle da câmera</h2>
                <p>Direção, zoom e velocidade</p>
              </div>
            </div>
            {ptzAvailable ? (
              <>
                <PtzPanel
                  cameraId={camera.id}
                  cameraName={camera.name}
                  supported
                  zoomSupported
                  presetsSupported={false}
                />
                <p className="fullscreen-control-hint">
                  Mantenha uma direção pressionada para mover. Solte para parar.
                </p>
              </>
            ) : (
              <div className="fullscreen-ptz-empty">
                <CameraIcon size={28} />
                <h3>
                  {camera.supportsPtz
                    ? 'Câmera desativada'
                    : 'Câmera sem controle PTZ'}
                </h3>
                <p>
                  {camera.supportsPtz
                    ? 'Ative a câmera para usar os controles de movimento.'
                    : 'O enquadramento desta câmera não pode ser movido por aqui.'}
                </p>
              </div>
            )}
            <section
              className="fullscreen-details"
              aria-labelledby="fullscreen-details-title"
            >
              <h2 id="fullscreen-details-title">
                <ActivityIcon size={15} /> Informações
              </h2>
              <dl>
                <div>
                  <dt>Endereço</dt>
                  <dd className="fullscreen-host">{camera.host}</dd>
                </div>
                <div>
                  <dt>Perfil de vídeo</dt>
                  <dd>{profile === 'main' ? 'Principal' : 'Secundário'}</dd>
                </div>
                <div>
                  <dt>Gravação</dt>
                  <dd>{recordingStatusLabel(camera.recordingStatus)}</dd>
                </div>
              </dl>
              {camera.hasCredential && (
                <span className="meta-chip">
                  <KeyIcon size={13} /> Acesso autenticado
                </span>
              )}
            </section>
            <div className="fullscreen-shortcut">
              <kbd>Esc</kbd> Voltar para todas as câmeras
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
