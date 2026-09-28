import { useEffect, useMemo, useState } from "react";
import type { SdCardCamera, SdCardRecording } from "../../shared/sd-card.js";
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExportIcon,
  SearchIcon,
} from "../icons.js";

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function time(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function SdCardPanel(): React.JSX.Element {
  const [cameras, setCameras] = useState<SdCardCamera[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<SdCardRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    let active = true;
    void window.api.sdCard
      .cameras()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        setCameras(result.value);
        setCameraId(
          (current) =>
            current ||
            result.value.find((camera) => camera.supported)?.id ||
            "",
        );
      })
      .catch(() => {
        if (active) setMessage("Não foi possível carregar as câmeras.");
      });
    return () => {
      active = false;
    };
  }, []);

  const sorted = useMemo(
    () => [...items].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [items],
  );
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);

  async function search(): Promise<void> {
    if (!cameraId || !date) return;
    setLoading(true);
    setItems([]);
    setPage(1);
    setMessage(null);
    try {
      const result = await window.api.sdCard.list(cameraId, date);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setItems(result.value);
      setMessage(
        result.value.length === 0
          ? "Nenhuma gravação encontrada neste dia."
          : `${result.value.length} gravações encontradas no cartão.`,
      );
    } catch {
      setMessage("Não foi possível consultar o cartão SD.");
    } finally {
      setLoading(false);
    }
  }

  async function download(item: SdCardRecording): Promise<void> {
    setDownloading(item.id);
    setMessage(null);
    try {
      const result = await window.api.sdCard.download(cameraId, item.id);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, downloaded: true } : entry,
        ),
      );
      setMessage("Vídeo importado para a biblioteca local.");
    } catch {
      setMessage("Não foi possível baixar o vídeo.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="panel sd-card-panel" aria-labelledby="sd-card-title">
      <div className="sd-card-heading">
        <div>
          <h3 id="sd-card-title">Gravações no cartão SD</h3>
          <p>Consulte e importe vídeos gravados pela câmera.</p>
        </div>
      </div>
      <div className="sd-card-controls">
        <div className="library-field">
          <label className="library-filter-label" htmlFor="sd-card-camera">
            <CameraIcon size={15} /> Câmera
          </label>
          <select
            id="sd-card-camera"
            className="field-input"
            value={cameraId}
            onChange={(event) => {
              setCameraId(event.target.value);
              setItems([]);
              setMessage(null);
            }}
          >
            <option value="">Selecione uma câmera</option>
            {cameras.map((camera) => (
              <option
                key={camera.id}
                value={camera.id}
                disabled={!camera.supported}
              >
                {camera.name}
                {camera.supported ? "" : " — indisponível"}
              </option>
            ))}
          </select>
        </div>
        <div className="library-field">
          <label className="library-filter-label" htmlFor="sd-card-date">
            Dia
          </label>
          <input
            id="sd-card-date"
            className="field-input library-date-input"
            type="date"
            value={date}
            max={today()}
            onChange={(event) => {
              setDate(event.target.value);
              setItems([]);
              setMessage(null);
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!cameraId || !date || loading || downloading !== null}
          onClick={() => void search()}
        >
          <SearchIcon size={16} />
          {loading ? "Buscando…" : "Buscar no cartão"}
        </button>
      </div>
      {cameras.some((camera) => !camera.supported) && (
        <p className="sd-card-note">
          A consulta do cartão ainda não está disponível nos modelos marcados
          como indisponíveis.
        </p>
      )}
      {message && (
        <p className="sd-card-message" role="status">
          {message}
        </p>
      )}
      {items.length > 0 && (
        <>
          <div className="sd-card-list">
            {visible.map((item) => (
              <div key={item.id} className="sd-card-item">
                <div>
                  <strong>{time(item.startedAt)}</strong>
                  <span>
                    {Math.round(item.durationMs / 1000)} s ·{" "}
                    {(item.bytes / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={item.downloaded || downloading !== null}
                  onClick={() => void download(item)}
                >
                  <ExportIcon size={15} />
                  {item.downloaded
                    ? "Na biblioteca"
                    : downloading === item.id
                      ? "Baixando…"
                      : "Importar"}
                </button>
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="sd-card-pages">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeftIcon size={15} />
                Anterior
              </button>
              <span>
                Página {page} de {pages}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page === pages}
                onClick={() => setPage(page + 1)}
              >
                Próxima
                <ChevronRightIcon size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
