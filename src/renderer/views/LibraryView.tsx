import { useMemo, useState } from 'react'
import type { CameraSummary } from '../../shared/contracts.js'
import { ImageIcon, RecIcon } from '../icons.js'

interface LibraryViewProps {
  cameras: CameraSummary[]
  mode: 'snapshots' | 'recordings'
}

export function LibraryView({ cameras, mode }: LibraryViewProps): React.JSX.Element {
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const items = useMemo(() => {
    // The library catalogs snapshots/recordings by camera and date; here we
    // show the available cameras to browse.
    return cameras.filter((camera) => !selectedCamera || camera.id === selectedCamera)
  }, [cameras, selectedCamera])

  const Icon = mode === 'snapshots' ? ImageIcon : RecIcon
  const title = mode === 'snapshots' ? 'Snapshots' : 'Gravações'

  return (
    <div className="panel">
      <div className="section-heading">
        <h2 className="section-title">{title}</h2>
        <div className="field field-narrow">
          <select
            className="field-input"
            aria-label="Filtrar por câmera"
            value={selectedCamera}
            onChange={(event) => setSelectedCamera(event.target.value)}
          >
            <option value="">Todas as câmeras</option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <Icon size={24} />
          </span>
          <h3 className="empty-state-title">Nenhuma câmera disponível</h3>
          <p className="empty-state-text">
            Cadastre câmeras para visualizar {title.toLowerCase()} por câmera, data e horário.
          </p>
        </div>
      ) : (
        <ul className="library-list">
          {items.map((camera) => (
            <li key={camera.id} className="library-item">
              <span className="library-item-icon">
                <Icon size={18} />
              </span>
              <div className="library-item-body">
                <span className="library-item-name">{camera.name}</span>
                <span className="library-item-meta">
                  {mode === 'snapshots'
                    ? 'Snapshots por data/hora com abertura segura do arquivo.'
                    : 'Gravações fMP4/MP4 por data/hora/duração/estado.'}
                </span>
              </div>
              <span className="meta-chip">{camera.host}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
