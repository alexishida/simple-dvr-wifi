import { useEffect, useState } from 'react'
import {
  CONFIG_DEFAULTS,
  type AppConfig,
  type StreamBehavior,
  type Theme,
  type LogLevel,
} from '../../shared/config.js'

interface SettingsViewProps {
  initialConfig: AppConfig | null
}

export function SettingsView({ initialConfig }: SettingsViewProps): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig>(initialConfig ?? CONFIG_DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setConfig(initialConfig ?? CONFIG_DEFAULTS)
  }, [initialConfig])

  async function persist(): Promise<void> {
    const result = await window.api.config.save(config)
    if (result.ok && result.value.saved) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2_000)
    }
  }

  function update<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="settings-grid">
      <section className="panel" aria-labelledby="appearance-heading">
        <h2 className="panel-title" id="appearance-heading">
          Aparência
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="theme">
            Tema
          </label>
          <select
            id="theme"
            className="field-input"
            value={config.theme}
            onChange={(event) => update('theme', event.target.value as Theme)}
          >
            <option value="dark">Escuro</option>
            <option value="light">Claro</option>
            <option value="system">Sistema</option>
          </select>
        </div>
      </section>

      <section className="panel" aria-labelledby="reconnect-heading">
        <h2 className="panel-title" id="reconnect-heading">
          Reconexão
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="initial-delay">
            Atraso inicial (ms)
          </label>
          <input
            id="initial-delay"
            type="number"
            min={500}
            max={60_000}
            className="field-input"
            value={config.reconnect.initialDelayMs}
            onChange={(event) =>
              update('reconnect', {
                ...config.reconnect,
                initialDelayMs: Number(event.target.value),
              })
            }
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="max-delay">
            Atraso máximo (ms)
          </label>
          <input
            id="max-delay"
            type="number"
            min={1_000}
            max={300_000}
            className="field-input"
            value={config.reconnect.maxDelayMs}
            onChange={(event) =>
              update('reconnect', { ...config.reconnect, maxDelayMs: Number(event.target.value) })
            }
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="max-attempts">
            Tentativas máximas
          </label>
          <input
            id="max-attempts"
            type="number"
            min={0}
            max={100}
            className="field-input"
            value={config.reconnect.maxAttempts}
            onChange={(event) =>
              update('reconnect', { ...config.reconnect, maxAttempts: Number(event.target.value) })
            }
          />
        </div>
      </section>

      <section className="panel" aria-labelledby="logs-heading">
        <h2 className="panel-title" id="logs-heading">
          Logs
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="log-level">
            Nível de log
          </label>
          <select
            id="log-level"
            className="field-input"
            value={config.log.level}
            onChange={(event) =>
              update('log', { ...config.log, level: event.target.value as LogLevel })
            }
          >
            <option value="error">Erro</option>
            <option value="warn">Aviso</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>
      </section>

      <section className="panel" aria-labelledby="directories-heading">
        <h2 className="panel-title" id="directories-heading">
          Diretórios
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="snapshot-dir">
            Snapshots
          </label>
          <input
            id="snapshot-dir"
            className="field-input"
            placeholder="Deixe vazio para o padrão local"
            value={config.snapshotDir}
            onChange={(event) => update('snapshotDir', event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="recordings-dir">
            Gravações
          </label>
          <input
            id="recordings-dir"
            className="field-input"
            placeholder="Deixe vazio para o padrão local"
            value={config.recordingsDir}
            onChange={(event) => update('recordingsDir', event.target.value)}
          />
        </div>
      </section>

      <section className="panel" aria-labelledby="streams-heading">
        <h2 className="panel-title" id="streams-heading">
          Streams e aceleração
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="stream-behavior">
            Comportamento de streams
          </label>
          <select
            id="stream-behavior"
            className="field-input"
            value={config.streams.behavior}
            onChange={(event) =>
              update('streams', {
                ...config.streams,
                behavior: event.target.value as StreamBehavior,
              })
            }
          >
            <option value="sub-first">Substream primeiro</option>
            <option value="main-only">Somente main</option>
            <option value="balanced">Equilibrado</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="max-transcodes">
            Transcodificações máximas
          </label>
          <input
            id="max-transcodes"
            type="number"
            min={0}
            max={16}
            className="field-input"
            value={config.streams.maxTranscodes}
            onChange={(event) =>
              update('streams', { ...config.streams, maxTranscodes: Number(event.target.value) })
            }
          />
        </div>
        <div className="field field-checkbox">
          <label className="field-label" htmlFor="hw-accel">
            <input
              id="hw-accel"
              type="checkbox"
              checked={config.streams.enableHardwareAcceleration}
              onChange={(event) =>
                update('streams', {
                  ...config.streams,
                  enableHardwareAcceleration: event.target.checked,
                })
              }
            />
            Aceleração de hardware
          </label>
        </div>
      </section>

      <div className="settings-actions">
        <button className="btn btn-primary" type="button" onClick={() => void persist()}>
          {saved ? 'Salvo' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}
