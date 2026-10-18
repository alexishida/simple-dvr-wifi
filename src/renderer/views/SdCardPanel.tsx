import { useEffect, useMemo, useState } from "react";
import type { SdCardCamera, SdCardRecording } from "../../shared/sd-card.js";
import {
  CameraIcon,
  CalendarIcon,
  CheckIcon,
  ActivityIcon,
  FolderIcon,
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
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const busy = loading || downloading !== null;
  const pageSize = 20;

  useEffect(() => {
    let active = true;
    void window.api.sdCard
      .cameras()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setFailed(true);
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
        if (active) {
          setFailed(true);
          setMessage("Não foi possível carregar as câmeras.");
        }
      })
      .finally(() => {
        if (active) setLoadingCameras(false);
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
    if (!cameraId || !date || busy) return;
    setSearched(true);
    setFailed(false);
    setLoading(true);
    setItems([]);
    setPage(1);
    setMessage(null);
    try {
      const result = await window.api.sdCard.list(cameraId, date);
      if (!result.ok) {
        setFailed(true);
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
      setFailed(true);
      setMessage("Não foi possível consultar o cartão SD.");
    } finally {
      setLoading(false);
    }
  }

  async function download(item: SdCardRecording): Promise<void> {
    if (busy) return;
    setFailed(false);
    setDownloading(item.id);
    setMessage(null);
    try {
      const result = await window.api.sdCard.download(cameraId, item.id);
      if (!result.ok) {
        setFailed(true);
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
      setFailed(true);
      setMessage("Não foi possível baixar o vídeo.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="panel sd-card-panel" aria-labelledby="sd-card-title">
      <div className="sd-card-heading recording-search-heading">
        <span className="library-summary-icon">
          <CameraIcon size={22} />
        </span>
        <div>
          <h3 id="sd-card-title">Gravações no cartão SD</h3>
          <p>Consulte e importe vídeos gravados pela câmera.</p>
        </div>
      </div>
      <form
        className="sd-card-controls"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="library-field">
          <label className="library-filter-label" htmlFor="sd-card-camera">
            <CameraIcon size={15} /> Câmera
          </label>
          <select
            id="sd-card-camera"
            className="field-input"
            value={cameraId}
            disabled={busy || loadingCameras}
            onChange={(event) => {
              setCameraId(event.target.value);
              setItems([]);
              setMessage(null);
              setSearched(false);
              setFailed(false);
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
            <CalendarIcon size={15} /> Dia da gravação
          </label>
          <input
            id="sd-card-date"
            className="field-input library-date-input"
            type="date"
            value={date}
            required
            disabled={busy}
            max={today()}
            onChange={(event) => {
              setDate(event.target.value);
              setItems([]);
              setMessage(null);
              setSearched(false);
              setFailed(false);
            }}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!cameraId || !date || loading || downloading !== null}
        >
          <SearchIcon size={16} />
          {loading ? "Buscando…" : "Buscar no cartão"}
        </button>
      </form>
      {cameras.some((camera) => !camera.supported) && (
        <p className="sd-card-note">
          A consulta do cartão ainda não está disponível nos modelos marcados
          como indisponíveis.
        </p>
      )}
      {message && (
        <p
          className={`sd-card-message${failed ? " is-error" : ""}`}
          role={failed ? "alert" : "status"}
        >
          {failed ? <ActivityIcon size={17} /> : <CheckIcon size={17} />}{" "}
          {message}
        </p>
      )}
      {loadingCameras ? (
        <p className="library-loading" role="status">
          Carregando câmeras…
        </p>
      ) : loading ? (
        <div className="empty-state" role="status">
          <SearchIcon size={28} />
          <h3>Consultando a câmera…</h3>
          <p>Aguarde enquanto buscamos os vídeos deste dia.</p>
        </div>
      ) : (
        !failed &&
        items.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">
              <SearchIcon size={28} />
            </span>
            <h3 className="empty-state-title">
              {!cameras.some((camera) => camera.supported)
                ? "Nenhuma câmera compatível"
                : searched
                  ? "Nenhuma gravação neste dia"
                  : "Encontre vídeos no cartão da câmera"}
            </h3>
            <p className="empty-state-text">
              {!cameras.some((camera) => camera.supported)
                ? "Cadastre uma câmera compatível com a consulta ao cartão SD."
                : searched
                  ? "Escolha outra data e busque novamente."
                  : "Selecione a câmera e o dia. Depois, importe os vídeos para assistir na biblioteca local."}
            </p>
          </div>
        )
      )}
      {items.length > 0 && (
        <>
          <div className="sd-card-results-heading">
            <h3>
              Vídeos encontrados{" "}
              <span className="recording-result-count">{items.length}</span>
            </h3>
            <p>
              <FolderIcon size={15} /> Importe para assistir na biblioteca
              local.
            </p>
          </div>
          <div className="sd-card-list" aria-label="Gravações no cartão SD">
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
                  {item.downloaded ? (
                    <CheckIcon size={15} />
                  ) : (
                    <ExportIcon size={15} />
                  )}
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
