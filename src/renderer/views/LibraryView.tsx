import { useEffect, useMemo, useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import type { RecordingRecord, SnapshotRecord } from "../../shared/database.js";
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ImageIcon,
  RecIcon,
  TrashIcon,
  VideoIcon,
} from "../icons.js";
import { recordingStatusLabel } from "../status.js";

type RecordingLibraryItem = RecordingRecord & { path: string | null };

const PAGE_SIZE = 8;

interface LibraryViewProps {
  cameras: CameraSummary[];
  mode: "snapshots" | "recordings";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "em andamento";
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function SnapshotPreview({
  snapshotId,
  cameraName,
}: {
  snapshotId: string;
  cameraName: string;
}): React.JSX.Element {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  return (
    <>
      {status !== "error" && (
        <img
          className={`snapshot-preview-image${status === "loaded" ? " is-loaded" : ""}`}
          src={`app://renderer/media/snapshots/${encodeURIComponent(snapshotId)}`}
          alt={`Snapshot da câmera ${cameraName}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
      {status !== "loaded" && (
        <span className="snapshot-preview-placeholder" role="status">
          <ImageIcon size={28} />
          <span>
            {status === "loading" ? "Carregando foto…" : "Foto indisponível"}
          </span>
        </span>
      )}
    </>
  );
}

function RecordingPreview({
  recordingId,
  cameraName,
}: {
  recordingId: string;
  cameraName: string;
}): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const loadPreview = window.api.library.recordingPreview;
    if (typeof loadPreview !== "function") {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void loadPreview(recordingId)
      .then((result) => {
        if (active) setDataUrl(result.ok ? result.value.dataUrl : null);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recordingId]);

  if (dataUrl) {
    return (
      <img
        className="recording-preview-image"
        src={dataUrl}
        alt={`Preview da gravação da câmera ${cameraName}`}
      />
    );
  }

  return (
    <div
      className="recording-preview-placeholder"
      role="img"
      aria-label={loading ? "Carregando preview" : "Preview indisponível"}
    >
      <RecIcon size={28} />
      <span>{loading ? "Carregando preview…" : "Preview indisponível"}</span>
    </div>
  );
}

export function LibraryView({
  cameras,
  mode,
}: LibraryViewProps): React.JSX.Element {
  const [selectedCamera, setSelectedCamera] = useState("");
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [recordings, setRecordings] = useState<RecordingLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [playingRecording, setPlayingRecording] =
    useState<RecordingLibraryItem | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const cameraId = selectedCamera || undefined;
    const request =
      mode === "snapshots"
        ? window.api.library.snapshots(cameraId)
        : window.api.library.recordings(cameraId);
    void request
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.error.message);
        } else if (mode === "snapshots") {
          setSnapshots(result.value as SnapshotRecord[]);
        } else {
          setRecordings(result.value as RecordingLibraryItem[]);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Não foi possível carregar a biblioteca.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, selectedCamera]);

  useEffect(() => {
    if (!playingRecording) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setPlayingRecording(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playingRecording]);

  useEffect(() => {
    if (!playingRecording) {
      setPlaybackUrl(null);
      return;
    }

    setPlaybackError(null);
    setPlaybackUrl(
      `app://renderer/media/recordings/${encodeURIComponent(playingRecording.id)}`,
    );
  }, [playingRecording]);

  const cameraNames = useMemo(
    () => new Map(cameras.map((camera) => [camera.id, camera.name])),
    [cameras],
  );
  const items = mode === "snapshots" ? snapshots : recordings;
  const Icon = mode === "snapshots" ? ImageIcon : RecIcon;
  const title = mode === "snapshots" ? "Snapshots" : "Gravações";
  const itemCount =
    mode === "snapshots"
      ? `${items.length} ${items.length === 1 ? "foto" : "fotos"}`
      : `${items.length} ${items.length === 1 ? "gravação" : "gravações"}`;
  const filterId = `library-camera-filter-${mode}`;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStart = (visiblePage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, items.length);
  const visibleSnapshots = snapshots.slice(pageStart, pageEnd);
  const visibleRecordings = recordings.slice(pageStart, pageEnd);

  const adjustPageAfterDeletion = (remainingItems: number): void => {
    const remainingPages = Math.max(1, Math.ceil(remainingItems / PAGE_SIZE));
    setCurrentPage((page) => Math.min(page, remainingPages));
  };

  const deleteSnapshot = async (snapshot: SnapshotRecord): Promise<void> => {
    const cameraName = cameraNames.get(snapshot.cameraId) ?? "câmera removida";
    if (
      !window.confirm(
        `Excluir a foto de ${cameraName}, capturada em ${formatDate(snapshot.capturedAt)}? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setDeletingId(snapshot.id);
    setError(null);
    try {
      if (typeof window.api.library.deleteSnapshot !== "function") {
        throw new Error(
          "Feche e abra o aplicativo para concluir a atualização.",
        );
      }

      const result = await window.api.library.deleteSnapshot(snapshot.id);
      if (result.ok && result.value.deleted) {
        setSnapshots((current) =>
          current.filter((item) => item.id !== snapshot.id),
        );
        adjustPageAfterDeletion(snapshots.length - 1);
      } else {
        setError(
          result.ok ? "Não foi possível excluir a foto." : result.error.message,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir a foto.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const deleteRecording = async (
    recording: RecordingLibraryItem,
  ): Promise<void> => {
    const cameraName = cameraNames.get(recording.cameraId) ?? "câmera removida";
    if (
      !window.confirm(
        `Excluir a gravação de ${cameraName}, iniciada em ${formatDate(recording.startedAt)}? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setDeletingId(recording.id);
    setError(null);
    try {
      if (typeof window.api.library.deleteRecording !== "function") {
        throw new Error(
          "Feche e abra o aplicativo para concluir a atualização.",
        );
      }

      const result = await window.api.library.deleteRecording(recording.id);
      if (result.ok && result.value.deleted) {
        setRecordings((current) =>
          current.filter((item) => item.id !== recording.id),
        );
        adjustPageAfterDeletion(recordings.length - 1);
      } else {
        setError(
          result.ok
            ? "Não foi possível excluir a gravação."
            : result.error.message,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir a gravação.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const openSystemPlayer = async (
    recording: RecordingLibraryItem,
  ): Promise<void> => {
    if (!recording.path) return;
    setPlaybackError(null);
    const result = await window.api.library.openRecording(recording.path);
    if (!result.ok || !result.value.opened) {
      setPlaybackError(
        result.ok
          ? "Não foi possível abrir o player do sistema."
          : result.error.message,
      );
    }
  };

  return (
    <div className="panel library-panel">
      <div className="library-toolbar">
        <div className="library-summary">
          <span className="library-summary-icon">
            <Icon size={20} />
          </span>
          <div>
            <h2 className="library-title">
              Biblioteca de {title.toLowerCase()}
            </h2>
            <p className="library-count" aria-live="polite">
              {loading ? "Atualizando…" : itemCount}
            </p>
          </div>
        </div>
        <div className="library-filter">
          <label className="library-filter-label" htmlFor={filterId}>
            <CameraIcon size={15} />
            Câmera
          </label>
          <select
            id={filterId}
            className="field-input"
            value={selectedCamera}
            onChange={(event) => {
              setSelectedCamera(event.target.value);
              setCurrentPage(1);
            }}
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

      {error && <p className="form-message form-error">{error}</p>}
      {loading ? (
        <p className="library-loading" role="status">
          Carregando biblioteca…
        </p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <Icon size={24} />
          </span>
          <h3 className="empty-state-title">Nenhum item encontrado</h3>
          <p className="empty-state-text">
            {mode === "snapshots"
              ? "Os snapshots capturados aparecerão aqui."
              : "As gravações iniciadas pelo monitoramento aparecerão aqui."}
          </p>
        </div>
      ) : (
        <>
          <ul
            className={`library-list${mode === "snapshots" ? " snapshot-list" : ""}`}
          >
            {mode === "snapshots"
              ? visibleSnapshots.map((snapshot) => (
                  <li key={snapshot.id} className="library-item snapshot-card">
                    <button
                      type="button"
                      className="snapshot-preview"
                      aria-label={`Abrir foto de ${cameraNames.get(snapshot.cameraId) ?? "Câmera removida"}, capturada em ${formatDate(snapshot.capturedAt)}`}
                      onClick={() =>
                        void window.api.library.openSnapshot(snapshot.path)
                      }
                    >
                      <SnapshotPreview
                        snapshotId={snapshot.id}
                        cameraName={
                          cameraNames.get(snapshot.cameraId) ??
                          "Câmera removida"
                        }
                      />
                    </button>
                    <div className="snapshot-card-header">
                      <span className="library-item-icon">
                        <CameraIcon size={20} />
                      </span>
                      <div className="snapshot-card-heading">
                        <span className="snapshot-card-label">Câmera</span>
                        <h3
                          className="snapshot-card-title"
                          title={
                            cameraNames.get(snapshot.cameraId) ??
                            "Câmera removida"
                          }
                        >
                          {cameraNames.get(snapshot.cameraId) ??
                            "Câmera removida"}
                        </h3>
                        <div className="snapshot-card-capture">
                          <span>Capturada em</span>
                          <time dateTime={snapshot.capturedAt}>
                            {formatDate(snapshot.capturedAt)}
                          </time>
                        </div>
                      </div>
                    </div>
                    <div className="snapshot-card-actions">
                      <button
                        type="button"
                        className="btn btn-secondary snapshot-card-open"
                        onClick={() =>
                          void window.api.library.openSnapshot(snapshot.path)
                        }
                      >
                        <ImageIcon size={16} />
                        Abrir foto
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-danger snapshot-card-delete"
                        disabled={deletingId === snapshot.id}
                        onClick={() => void deleteSnapshot(snapshot)}
                      >
                        <TrashIcon size={16} />
                        {deletingId === snapshot.id ? "Excluindo…" : "Excluir"}
                      </button>
                    </div>
                  </li>
                ))
              : visibleRecordings.map((recording) => (
                  <li key={recording.id} className="library-item">
                    <div className="recording-preview">
                      <RecordingPreview
                        recordingId={recording.id}
                        cameraName={
                          cameraNames.get(recording.cameraId) ??
                          "Câmera removida"
                        }
                      />
                      <span className="library-item-kind">
                        {recordingStatusLabel(recording.status)}
                      </span>
                    </div>
                    <div className="library-item-body">
                      <p className="library-item-detail">
                        <span>Câmera</span>
                        <strong>
                          {cameraNames.get(recording.cameraId) ??
                            "Câmera removida"}
                        </strong>
                      </p>
                      <p className="library-item-detail">
                        <span>Gravado em</span>
                        <time dateTime={recording.startedAt}>
                          {formatDate(recording.startedAt)}
                        </time>
                      </p>
                      <p className="library-item-detail">
                        <span>Duração</span>
                        <strong>{formatDuration(recording.durationMs)}</strong>
                      </p>
                      <p
                        className={`library-item-file-status${recording.path ? " library-item-file-available" : " library-item-file-missing"}`}
                      >
                        <VideoIcon size={14} />
                        {recording.path
                          ? "Vídeo disponível"
                          : "Arquivo de vídeo não gerado"}
                      </p>
                    </div>
                    <div className="library-item-actions">
                      <button
                        type="button"
                        className="btn btn-secondary library-item-action"
                        title={
                          recording.path
                            ? "Reproduzir gravação"
                            : "Informar por que o vídeo está indisponível"
                        }
                        onClick={() => {
                          if (recording.path) {
                            setPlaybackError(null);
                            setPlayingRecording(recording);
                          } else {
                            setError(
                              "Esta gravação não possui um arquivo de vídeo. Faça uma nova gravação após a atualização para habilitar a reprodução.",
                            );
                          }
                        }}
                      >
                        <RecIcon size={16} />
                        Reproduzir
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger library-item-action"
                        disabled={deletingId === recording.id}
                        onClick={() => void deleteRecording(recording)}
                      >
                        <TrashIcon size={16} />
                        {deletingId === recording.id ? "Excluindo…" : "Excluir"}
                      </button>
                    </div>
                  </li>
                ))}
          </ul>
          <nav
            className="library-pagination"
            aria-label={`Paginação de ${title.toLowerCase()}`}
          >
            <p className="library-pagination-status" aria-live="polite">
              <span>
                {pageStart + 1}–{pageEnd} de {items.length}
              </span>
              <span>
                Página {visiblePage} de {totalPages}
              </span>
            </p>
            <div className="library-pagination-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm library-page-button"
                disabled={visiblePage === 1}
                onClick={() => setCurrentPage(visiblePage - 1)}
              >
                <ChevronLeftIcon size={16} />
                Anterior
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm library-page-button"
                disabled={visiblePage === totalPages}
                onClick={() => setCurrentPage(visiblePage + 1)}
              >
                Próxima
                <ChevronRightIcon size={16} />
              </button>
            </div>
          </nav>
        </>
      )}
      {playingRecording?.path && (
        <div
          className="modal-backdrop recording-player-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPlayingRecording(null);
            }
          }}
        >
          <section
            className="modal recording-player-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recording-player-title"
          >
            <header className="recording-player-header">
              <div>
                <h3 id="recording-player-title">Reproduzir gravação</h3>
                <p>
                  {cameraNames.get(playingRecording.cameraId) ??
                    "Câmera removida"}{" "}
                  · {formatDate(playingRecording.startedAt)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-icon recording-player-close"
                aria-label="Fechar reprodução"
                title="Fechar"
                onClick={() => setPlayingRecording(null)}
              >
                <CloseIcon size={18} />
              </button>
            </header>
            {playbackUrl ? (
              <video
                key={playbackUrl}
                className="recording-player-video"
                src={playbackUrl}
                controls
                autoPlay
                playsInline
                onError={() =>
                  setPlaybackError(
                    "O vídeo não pôde ser reproduzido internamente. Tente o player do sistema.",
                  )
                }
              />
            ) : !playbackError ? (
              <p className="library-loading" role="status">
                Carregando vídeo…
              </p>
            ) : null}
            {playbackError && (
              <p className="form-message form-error" role="alert">
                {playbackError}
              </p>
            )}
            <div className="recording-player-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void openSystemPlayer(playingRecording)}
              >
                <VideoIcon size={16} />
                Abrir no player do sistema
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
