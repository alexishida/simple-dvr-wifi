import { useEffect, useState } from 'react'
import type { CameraSummary } from '../../shared/contracts.js'
import type { DiagnosticRecord } from '../../shared/database.js'

interface DiagnosticsViewProps {
  cameras: CameraSummary[]
}

export function DiagnosticsView({ cameras }: DiagnosticsViewProps): React.JSX.Element {
  const [diagnostics, setDiagnostics] = useState<DiagnosticRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [cameraFilter, setCameraFilter] = useState<string>('')

  useEffect(() => {
    void window.api.diagnostics.list().then((result) => {
      if (result.ok) setDiagnostics(result.value)
      setLoading(false)
    })
  }, [])

  const filtered = cameraFilter
    ? diagnostics.filter((d) => d.cameraId === cameraFilter)
    : diagnostics

  return (
    <div className="panel">
      <div className="section-heading">
        <h2 className="section-title">Ocorrências recentes</h2>
        <div className="diagnostics-tools">
          <div className="field field-narrow">
            <select
              className="field-input"
              aria-label="Filtrar por câmera"
              value={cameraFilter}
              onChange={(event) => setCameraFilter(event.target.value)}
            >
              <option value="">Todas as câmeras</option>
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name}
                </option>
              ))}
            </select>
          </div>
          <span className="status-badge status-info">
            <span className="status-dot" aria-hidden="true" />
            {filtered.length} agrupada(s)
          </span>
        </div>
      </div>

      {loading ? (
        <p className="empty-state-text">Carregando diagnósticos…</p>
      ) : filtered.length === 0 ? (
        <p className="empty-state-text">
          Nenhum problema registrado. Falhas idênticas são consolidadas automaticamente e erros
          sanitizados não expõem senhas, tokens ou URLs autenticadas.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Câmera</th>
              <th scope="col">Código</th>
              <th scope="col">Mensagem sanitizada</th>
              <th scope="col">Ocorrências</th>
              <th scope="col">Última vez (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const camera = cameras.find((c) => c.id === d.cameraId)
              return (
                <tr key={d.id}>
                  <td>{camera?.name ?? (d.cameraId ? 'Câmera removida' : 'Global')}</td>
                  <td>
                    <code className="code-cell">{d.code}</code>
                  </td>
                  <td className="message-cell">{d.message}</td>
                  <td>{d.count}</td>
                  <td className="timestamp-cell">{d.lastSeen}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
