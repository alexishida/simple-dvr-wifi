import { useEffect, useState } from "react";
import { SearchIcon, WifiIcon, CameraIcon } from "../icons.js";

export interface DiscoveryCamera {
  epr: string;
  addresses: string[];
  types: string[];
  scopes: string[];
}

export interface NetworkInterfaceSummary {
  name: string;
  category: string;
  addresses: string[];
  eligible: boolean;
}

interface DiscoveryViewProps {
  onAddCamera: (camera: DiscoveryCamera) => void;
  onAddRtspCamera: () => void;
}

export function DiscoveryView({
  onAddCamera,
  onAddRtspCamera,
}: DiscoveryViewProps): React.JSX.Element {
  const [interfaces, setInterfaces] = useState<NetworkInterfaceSummary[]>([]);
  const [interfacesLoading, setInterfacesLoading] = useState(true);
  const [selectedInterface, setSelectedInterface] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiscoveryCamera[]>([]);
  const [explanation, setExplanation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.api.discovery.interfaces().then((result) => {
      if (result.ok) {
        const eligible = result.value.filter((entry) => entry.eligible);
        setInterfaces(eligible);
        const first = eligible[0];
        if (first) setSelectedInterface(first.name);
        if (eligible.length === 0) {
          setError("Nenhuma interface IPv4 elegível foi encontrada.");
        }
      } else {
        setError(result.error.message);
      }
      setInterfacesLoading(false);
    });
  }, []);

  async function start(): Promise<void> {
    if (!selectedInterface || running) return;
    setRunning(true);
    setResults([]);
    setError(null);
    const result = await window.api.discovery.start({
      interfaceName: selectedInterface,
      timeoutMs: 6_000,
    });
    try {
      if (result.ok) {
        setResults(result.value);
      } else {
        setError(result.error.message);
      }
    } finally {
      setRunning(false);
    }
  }

  async function cancel(): Promise<void> {
    const result = await window.api.discovery.cancel();
    if (!result.ok) setError(result.error.message);
    setRunning(false);
  }

  return (
    <div className="discovery-layout">
      <section className="panel" aria-labelledby="discovery-config">
        <h2 className="panel-title" id="discovery-config">
          Configuração da busca
        </h2>

        <div className="field">
          <label className="field-label" htmlFor="iface">
            Interface de rede
          </label>
          <select
            id="iface"
            className="field-input"
            value={selectedInterface}
            onChange={(event) => setSelectedInterface(event.target.value)}
            disabled={running}
          >
            {interfacesLoading && <option>Carregando interfaces…</option>}
            {!interfacesLoading && interfaces.length === 0 && (
              <option>Nenhuma interface disponível</option>
            )}
            {interfaces.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name} ({entry.category}) — {entry.addresses.join(", ")}
              </option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          {running ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void cancel()}
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void start()}
              disabled={interfacesLoading || !selectedInterface}
            >
              <SearchIcon size={16} />
              Iniciar busca
            </button>
          )}
          {!running && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onAddRtspCamera}
            >
              Cadastrar URL RTSP
            </button>
          )}
        </div>

        <button
          type="button"
          className="link-button"
          onClick={() => setExplanation((value) => !value)}
        >
          {explanation ? "Ocultar" : "Entender limitações de descoberta"}
        </button>

        {explanation && (
          <p className="empty-state-text discovery-hint">
            A descoberta usa WS-Discovery por multicast. Firewalls, VLANs, VPNs
            e o isolamento de clientes Wi-Fi podem bloquear as respostas. Nesse
            caso, use o cadastro manual — URLs RTSP não aparecem nesta busca.
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="discovery-results">
        <div className="section-heading">
          <h2 className="section-title" id="discovery-results">
            Resultados
          </h2>
          {running && (
            <span className="status-badge status-info">
              <span className="status-dot" aria-hidden="true" />
              Buscando…
            </span>
          )}
        </div>

        {!running && results.length === 0 && !error ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <WifiIcon size={24} />
            </span>
            <h3 className="empty-state-title">Nenhum dispositivo encontrado</h3>
            <p className="empty-state-text">
              Verifique as limitações de multicast e tente novamente, ou
              cadastre a câmera manualmente.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="empty-state" role="alert">
                <span className="empty-state-icon" aria-hidden="true">
                  <WifiIcon size={24} />
                </span>
                <h3 className="empty-state-title">Erro na busca</h3>
                <p className="empty-state-text">{error}</p>
              </div>
            )}
            <ul className="discovery-list">
              {results.map((camera) => (
                <li key={camera.epr} className="discovery-item">
                  <span className="empty-state-icon discovery-item-icon">
                    <CameraIcon size={18} />
                  </span>
                  <div className="discovery-item-body">
                    <div className="discovery-item-address">
                      {camera.addresses[0] ?? camera.epr}
                    </div>
                    <div className="discovery-item-meta">
                      {camera.types.length > 0
                        ? camera.types[0]
                        : "Dispositivo ONVIF"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onAddCamera(camera)}
                  >
                    Cadastrar
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
