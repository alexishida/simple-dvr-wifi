import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import type {
  MediaKind,
  MediaMetadata,
  MotionEventRecord,
  RecordingRecord,
  RecordingSegmentRecord,
  SnapshotRecord,
} from "../../shared/database.js";
import {
  CameraIcon,
  ActivityIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ExportIcon,
  FolderIcon,
  ImageIcon,
  HeartIcon,
  RecIcon,
  ShieldIcon,
  TrashIcon,
  VideoIcon,
} from "../icons.js";
import { recordingStatusLabel } from "../status.js";
import { SynchronizedPlayback } from "../components/SynchronizedPlayback.js";

type RecordingLibraryItem = RecordingRecord & { path: string | null };

const PAGE_SIZE = 8;
const PAGE_SIZES = [8, 16, 32] as const;

type SortOrder = "newest" | "oldest";
type LibraryLayout = "grid" | "list";
type LibraryDensity = "comfortable" | "compact";
type LibraryItem = SnapshotRecord | RecordingLibraryItem;

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

function itemTimestamp(item: SnapshotRecord | RecordingLibraryItem): string {
  return "capturedAt" in item ? item.capturedAt : item.startedAt;
}

function mediaKind(mode: LibraryViewProps["mode"]): MediaKind {
  return mode === "snapshots" ? "snapshot" : "recording";
}

function emptyMetadata(kind: MediaKind, mediaId: string): MediaMetadata {
  return {
    kind,
    mediaId,
    favorite: false,
    protected: false,
    tags: [],
    note: "",
    sourceRecordingId: null,
    sourcePositionMs: null,
    updatedAt: "",
  };
}

function formatDayHeading(timestamp: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
  }).format(new Date(timestamp));
}

function beginsDayGroup(
  items: Array<SnapshotRecord | RecordingLibraryItem>,
  index: number,
): boolean {
  if (index === 0) return true;
  const current = new Date(itemTimestamp(items[index]!)).toDateString();
  const previous = new Date(itemTimestamp(items[index - 1]!)).toDateString();
  return current !== previous;
}

function localDateTime(
  date: string,
  time: string,
  inclusiveEnd = false,
): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  if (!time) {
    return new Date(
      year,
      month - 1,
      inclusiveEnd ? day + 1 : day,
    ).toISOString();
  }
  if (!/^\d{2}:\d{2}$/.test(time)) return undefined;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours === undefined || minutes === undefined) return undefined;
  return new Date(
    year,
    month - 1,
    day,
    hours,
    minutes + (inclusiveEnd ? 1 : 0),
  ).toISOString();
}

function localDateValue(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTimeInputValue(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [layout, setLayout] = useState<LibraryLayout>("grid");
  const [density, setDensity] = useState<LibraryDensity>("comfortable");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZES)[number]>(PAGE_SIZE);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [recordings, setRecordings] = useState<RecordingLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [playingRecording, setPlayingRecording] =
    useState<RecordingLibraryItem | null>(null);
  const [synchronizedRecording, setSynchronizedRecording] =
    useState<RecordingLibraryItem | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playingSegments, setPlayingSegments] = useState<RecordingSegmentRecord[]>([]);
  const [playingSegmentIndex, setPlayingSegmentIndex] = useState(0);
  const [playbackSeekTime, setPlaybackSeekTime] = useState("");
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [clipStartAt, setClipStartAt] = useState("");
  const [clipEndAt, setClipEndAt] = useState("");
  const [clipExportJobId, setClipExportJobId] = useState<string | null>(null);
  const [clipExportPercent, setClipExportPercent] = useState(0);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const playbackCloseRef = useRef<HTMLButtonElement | null>(null);
  const snapshotCloseRef = useRef<HTMLButtonElement | null>(null);
  const [metadataById, setMetadataById] = useState<Map<string, MediaMetadata>>(
    new Map(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [viewingSnapshot, setViewingSnapshot] = useState<SnapshotRecord | null>(
    null,
  );
  const [compareSnapshotId, setCompareSnapshotId] = useState("");
  const [snapshotZoom, setSnapshotZoom] = useState(1);
  const [timelineCamera, setTimelineCamera] = useState("");
  const [timelineDate, setTimelineDate] = useState("");
  const [timelineRecordings, setTimelineRecordings] = useState<RecordingLibraryItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<MotionEventRecord[]>([]);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [occurrenceFilter, setOccurrenceFilter] = useState<"all" | "with-motion" | "without-motion">("all");
  const [eventStateFilter, setEventStateFilter] = useState<"all" | "started" | "ended">("all");
  const [eventVideoFilter, setEventVideoFilter] = useState<"all" | "with-video" | "without-video">("all");
  const pendingMotionPlaybackAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const filters = {
      cameraId: selectedCamera || undefined,
      startAt: localDateTime(startDate, startTime),
      endAt: localDateTime(endDate, endTime, true),
      occurrence: mode === "recordings" ? occurrenceFilter : undefined,
    };
    const request =
      mode === "snapshots"
        ? window.api.library.snapshots(filters)
        : window.api.library.recordings(filters);
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
  }, [
    mode,
    selectedCamera,
    startDate,
    startTime,
    endDate,
    endTime,
    occurrenceFilter,
    refreshVersion,
  ]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const updateSchedule = (): void => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (document.visibilityState !== "visible") return;
      timer = setInterval(() => {
        setRefreshVersion((version) => version + 1);
      }, 10_000);
    };

    updateSchedule();
    document.addEventListener("visibilitychange", updateSchedule);
    return () => {
      if (timer !== null) clearInterval(timer);
      document.removeEventListener("visibilitychange", updateSchedule);
    };
  }, []);

  useEffect(() => {
    if (!playingRecording) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        playerRef.current?.pause();
        setPlayingRecording(null);
      }
      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        event.target !== playerRef.current &&
        !(event.target instanceof HTMLInputElement)
      ) {
        event.preventDefault();
        if (playerRef.current) {
          playerRef.current.currentTime = Math.max(
            0,
            playerRef.current.currentTime + (event.key === "ArrowLeft" ? -5 : 5),
          );
        }
      }
    };
    queueMicrotask(() => playbackCloseRef.current?.focus());
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playingRecording]);

  useEffect(() => {
    if (!clipExportJobId) {
      setClipExportPercent(0);
      return;
    }
    let active = true;
    const poll = (): void => {
      void window.api.library.clipExportStatus(clipExportJobId).then((result) => {
        if (!active || !result.ok) return;
        setClipExportPercent(result.value.percent);
      }).catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, 500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [clipExportJobId]);

  useEffect(() => {
    if (!viewingSnapshot) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setViewingSnapshot(null);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      event.preventDefault();
      setViewingSnapshot((current) => {
        if (!current) return null;
        const index = sortedSnapshots.findIndex((snapshot) => snapshot.id === current.id);
        return sortedSnapshots[index + (event.key === "ArrowLeft" ? -1 : 1)] ?? current;
      });
      setSnapshotZoom(1);
    };
    queueMicrotask(() => snapshotCloseRef.current?.focus());
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewingSnapshot]);

  useEffect(() => {
    let active = true;
    if (!playingRecording) {
      pendingMotionPlaybackAt.current = null;
      setPlayingSegments([]);
      setPlayingSegmentIndex(0);
      setPlaybackUrl(null);
      return () => {
        active = false;
      };
    }
    setPlaybackError(null);
    setPlayingSegments([]);
    setPlayingSegmentIndex(0);
    void window.api.library.recordingSegments(playingRecording.id).then((result) => {
      if (!active) return;
      if (!result.ok || result.value.length === 0) {
        setPlaybackError(result.ok ? "Nenhum segmento de vídeo foi encontrado." : result.error.message);
        return;
      }
      const targetAt = pendingMotionPlaybackAt.current;
      pendingMotionPlaybackAt.current = null;
      if (targetAt) {
        const targetMs = Date.parse(targetAt);
        const index = result.value.findIndex((segment) =>
          Date.parse(segment.endedAt ?? segment.startedAt) >= targetMs);
        const selectedIndex = index < 0 ? result.value.length - 1 : index;
        const segment = result.value[selectedIndex]!;
        setPlayingSegmentIndex(selectedIndex);
        setPendingSeekSeconds(Math.max(0, (targetMs - Date.parse(segment.startedAt)) / 1_000));
        if (targetMs < Date.parse(segment.startedAt) || targetMs > Date.parse(segment.endedAt ?? segment.startedAt)) {
          setPlaybackError("Não há vídeo no instante exato; exibindo o trecho disponível mais próximo.");
        }
      }
      setPlayingSegments(result.value);
      setClipStartAt(localDateTimeInputValue(result.value[0]!.startedAt));
      const last = result.value.at(-1)!;
      setClipEndAt(localDateTimeInputValue(last.endedAt ?? last.startedAt));
    }).catch(() => {
      if (active) setPlaybackError("Não foi possível carregar os segmentos da gravação.");
    });
    return () => {
      active = false;
    };
  }, [playingRecording]);

  useEffect(() => {
    if (!playingRecording || playingSegments.length === 0) {
      setPlaybackUrl(null);
      return;
    }
    setPlaybackUrl(
      `app://renderer/media/recordings/${encodeURIComponent(playingRecording.id)}/${playingSegmentIndex}`,
    );
  }, [playingRecording, playingSegmentIndex, playingSegments.length]);

  const cameraNames = useMemo(
    () => new Map(cameras.map((camera) => [camera.id, camera.name])),
    [cameras],
  );
  const synchronizedCameras = useMemo(() => {
    if (!synchronizedRecording) return cameras;
    const anchor = cameras.find((camera) => camera.id === synchronizedRecording.cameraId);
    return anchor ? [anchor, ...cameras.filter((camera) => camera.id !== anchor.id)] : cameras;
  }, [cameras, synchronizedRecording]);
  const items = mode === "snapshots" ? snapshots : recordings;
  const Icon = mode === "snapshots" ? ImageIcon : RecIcon;
  const title = mode === "snapshots" ? "Snapshots" : "Gravações";
  const itemCount =
    mode === "snapshots"
      ? `${items.length} ${items.length === 1 ? "foto" : "fotos"}`
      : `${items.length} ${items.length === 1 ? "gravação" : "gravações"}`;
  const filterId = `library-camera-filter-${mode}`;
  const startDateId = `library-start-date-${mode}`;
  const startTimeId = `library-start-time-${mode}`;
  const endDateId = `library-end-date-${mode}`;
  const endTimeId = `library-end-time-${mode}`;
  const sortId = `library-sort-${mode}`;
  const layoutId = `library-layout-${mode}`;
  const densityId = `library-density-${mode}`;
  const pageSizeId = `library-page-size-${mode}`;
  const sortedSnapshots = useMemo(
    () =>
      [...snapshots].sort((a, b) =>
        sortOrder === "newest"
          ? b.capturedAt.localeCompare(a.capturedAt)
          : a.capturedAt.localeCompare(b.capturedAt),
      ),
    [snapshots, sortOrder],
  );
  const sortedRecordings = useMemo(
    () =>
      [...recordings].sort((a, b) =>
        sortOrder === "newest"
          ? b.startedAt.localeCompare(a.startedAt)
          : a.startedAt.localeCompare(b.startedAt),
      ),
    [recordings, sortOrder],
  );
  const sortedItems = mode === "snapshots" ? sortedSnapshots : sortedRecordings;
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStart = (visiblePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, sortedItems.length);
  const visibleSnapshots = sortedSnapshots.slice(pageStart, pageEnd);
  const visibleRecordings = sortedRecordings.slice(pageStart, pageEnd);
  const visibleItems: LibraryItem[] =
    mode === "snapshots" ? visibleSnapshots : visibleRecordings;
  const visibleItemIds = visibleItems.map((item) => item.id).join(":");
  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id));
  const viewingSnapshotIndex = viewingSnapshot
    ? sortedSnapshots.findIndex((snapshot) => snapshot.id === viewingSnapshot.id)
    : -1;
  const comparedSnapshot = sortedSnapshots.find(
    (snapshot) => snapshot.id === compareSnapshotId,
  );
  const timelineCameraId =
    timelineCamera || selectedCamera || sortedRecordings[0]?.cameraId || cameras[0]?.id || "";
  const effectiveTimelineDate =
    timelineDate ||
    (sortedRecordings[0] ? localDateValue(sortedRecordings[0].startedAt) : localDateValue(new Date().toISOString()));
  const timelineCameraOptions = Array.from(new Set([
    ...cameras.map((camera) => camera.id),
    ...sortedRecordings.map((recording) => recording.cameraId),
  ]));
  useEffect(() => {
    if (mode !== "recordings" || !timelineCameraId || !effectiveTimelineDate) return;
    let active = true;
    const dayStart = new Date(`${effectiveTimelineDate}T00:00:00`);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    setTimelineError(null);
    setTimelineRecordings([]);
    setTimelineEvents([]);
    void Promise.all([
      window.api.library.recordings({ cameraId: timelineCameraId, startAt: dayStart.toISOString(), endAt: dayEnd.toISOString() }),
      window.api.library.motionEvents({
        cameraId: timelineCameraId,
        startAt: dayStart.toISOString(),
        endAt: dayEnd.toISOString(),
        state: eventStateFilter === "all" ? undefined : eventStateFilter,
      }),
    ]).then(([recordingsResult, eventsResult]) => {
      if (!active) return;
      setTimelineRecordings(recordingsResult.ok ? recordingsResult.value : []);
      setTimelineEvents(eventsResult.ok ? eventsResult.value : []);
      if (!recordingsResult.ok || !eventsResult.ok) setTimelineError("Não foi possível carregar toda a linha do tempo.");
    }).catch(() => {
      if (active) setTimelineError("Não foi possível carregar a linha do tempo.");
    });
    return () => { active = false; };
  }, [mode, timelineCameraId, effectiveTimelineDate, eventStateFilter, refreshVersion]);
  const visibleTimelineEvents = timelineEvents.filter((event) =>
    eventVideoFilter === "all" || (eventVideoFilter === "with-video" ? event.hasVideo : !event.hasVideo));
  const timelineSegments = useMemo(() => {
    if (!timelineCameraId || !effectiveTimelineDate) return [];
    const dayStart = new Date(`${effectiveTimelineDate}T00:00:00`);
    const dayEnd = new Date(`${effectiveTimelineDate}T23:59:59.999`);
    const total = dayEnd.getTime() - dayStart.getTime();
    return timelineRecordings
      .map((recording) => {
        const start = new Date(recording.startedAt);
        const end = recording.endedAt ? new Date(recording.endedAt)
          : ["starting", "recording", "stopping"].includes(recording.status) ? new Date() : start;
        if (end < dayStart || start > dayEnd) return null;
        const clippedStart = Math.max(start.getTime(), dayStart.getTime());
        const clippedEnd = Math.min(Math.max(end.getTime(), clippedStart), dayEnd.getTime());
        return {
          recording,
          left: ((clippedStart - dayStart.getTime()) / total) * 100,
          width: Math.max(0.5, ((clippedEnd - clippedStart) / total) * 100),
        };
      })
      .filter((segment): segment is NonNullable<typeof segment> => segment !== null);
  }, [effectiveTimelineDate, timelineRecordings, timelineCameraId]);

  const openMotionEvent = async (event: MotionEventRecord): Promise<void> => {
    if (!event.recordingId || !event.hasVideo) {
      setTimelineError("Esta ocorrência não tem um trecho de vídeo disponível.");
      return;
    }
    try {
      const result = await window.api.library.recordingById(event.recordingId);
      if (!result.ok || !result.value?.path) {
        setTimelineError("A gravação vinculada à ocorrência não está disponível.");
        return;
      }
      setTimelineError(null);
      setPlaybackError(null);
      pendingMotionPlaybackAt.current = event.receivedAt;
      setPlayingRecording(result.value);
    } catch {
      setTimelineError("Não foi possível abrir a gravação vinculada à ocorrência.");
    }
  };

  useEffect(() => {
    let active = true;
    const kind = mediaKind(mode);
    void Promise.all(
      visibleItems.map(async (item) => {
        const result = await window.api.library.metadata({
          kind,
          mediaId: item.id,
        });
        return result.ok ? [item.id, result.value] as const : [item.id, null] as const;
      }),
    )
      .then((entries) => {
        if (!active) return;
        setMetadataById((current) => {
          const next = new Map(current);
          for (const [id, metadata] of entries) {
            if (metadata) next.set(id, metadata);
            else next.delete(id);
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [mode, visibleItemIds]);

  useEffect(() => {
    const availableIds = new Set(items.map((item) => item.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const adjustPageAfterDeletion = (remainingItems: number): void => {
    const remainingPages = Math.max(1, Math.ceil(remainingItems / pageSize));
    setCurrentPage((page) => Math.min(page, remainingPages));
  };

  const toggleSelection = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBatchResult(null);
  };

  const openSnapshotViewer = (snapshot: SnapshotRecord): void => {
    setViewingSnapshot(snapshot);
    setSnapshotZoom(1);
    setCompareSnapshotId((current) =>
      current && current !== snapshot.id ? current : "",
    );
  };

  const navigateSnapshot = (direction: -1 | 1): void => {
    if (viewingSnapshotIndex < 0) return;
    const next = sortedSnapshots[viewingSnapshotIndex + direction];
    if (!next) return;
    setViewingSnapshot(next);
    setSnapshotZoom(1);
    if (compareSnapshotId === next.id) setCompareSnapshotId("");
  };

  const toggleVisibleSelection = (): void => {
    const allVisibleSelected = visibleItems.every((item) => selectedIds.has(item.id));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of visibleItems) {
        if (allVisibleSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
    setBatchResult(null);
  };

  const applyBatchMetadata = async (
    field: "favorite" | "protected",
    value: boolean,
  ): Promise<void> => {
    const selectedItems = items.filter((item) => selectedIds.has(item.id));
    if (selectedItems.length === 0) return;
    const actionLabel = field === "favorite" ? "favorito" : "proteção";
    setBatchAction(`${field}:${value}`);
    setBatchResult(null);
    const kind = mediaKind(mode);
    const results = await Promise.allSettled(
      selectedItems.map(async (item) => {
        const cached = metadataById.get(item.id);
        const readResult = cached
          ? null
          : await window.api.library.metadata({ kind, mediaId: item.id });
        const existing =
          cached ??
          (readResult?.ok && readResult.value
            ? readResult.value
            : emptyMetadata(kind, item.id));
        const result = await window.api.library.updateMetadata({
          ...existing,
          [field]: value,
        });
        if (!result.ok) throw new Error(result.error.message);
        return result.value;
      }),
    );
    const updated = results.filter(
      (result): result is PromiseFulfilledResult<MediaMetadata> =>
        result.status === "fulfilled",
    );
    setMetadataById((current) => {
      const next = new Map(current);
      for (const result of updated) next.set(result.value.mediaId, result.value);
      return next;
    });
    const failed = results.length - updated.length;
    setBatchResult(
      failed === 0
        ? `${updated.length} itens receberam ${actionLabel}${value ? "" : " removida"}.`
        : `${updated.length} itens atualizados; ${failed} não puderam ser atualizados.`,
    );
    setBatchAction(null);
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

  const seekRecordingToTime = (): void => {
    if (!playingRecording || !/^\d{2}:\d{2}$/.test(playbackSeekTime)) return;
    const [hours, minutes] = playbackSeekTime.split(":" ).map(Number);
    const target = new Date(playingRecording.startedAt);
    target.setHours(hours!, minutes!, 0, 0);
    const segmentIndex = playingSegments.findIndex((segment) => {
      const start = Date.parse(segment.startedAt);
      const end = segment.endedAt ? Date.parse(segment.endedAt) : start;
      return target.getTime() >= start && target.getTime() <= end;
    });
    if (segmentIndex < 0) {
      setPlaybackError("Não há vídeo no horário selecionado.");
      return;
    }
    const offset = Math.max(
      0,
      (target.getTime() - Date.parse(playingSegments[segmentIndex]!.startedAt)) / 1_000,
    );
    setPlaybackError(null);
    setPendingSeekSeconds(offset);
    setPlayingSegmentIndex(segmentIndex);
  };

  const capturePlaybackFrame = async (): Promise<void> => {
    if (!playingRecording || !playerRef.current) return;
    const video = playerRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setPlaybackError("Aguarde o vídeo carregar antes de capturar um frame.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) {
      setPlaybackError("Não foi possível gerar o frame da gravação.");
      return;
    }
    setCapturingFrame(true);
    setPlaybackError(null);
    try {
      const saved = await window.api.snapshots.saveFrame({
        cameraId: playingRecording.cameraId,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
      if (!saved.ok || !saved.value.snapshotId) {
        throw new Error(saved.ok ? "Não foi possível salvar o frame." : saved.error.message);
      }
      const segment = playingSegments[playingSegmentIndex];
      const sourcePositionMs = Math.max(
        0,
        Math.round(
          (segment
            ? Date.parse(segment.startedAt) - Date.parse(playingRecording.startedAt)
            : 0) +
            video.currentTime * 1_000,
        ),
      );
      const metadata = await window.api.library.updateMetadata({
        ...emptyMetadata("snapshot", saved.value.snapshotId),
        sourceRecordingId: playingRecording.id,
        sourcePositionMs,
      });
      if (!metadata.ok) throw new Error(metadata.error.message);
      setRefreshVersion((version) => version + 1);
    } catch (cause) {
      setPlaybackError(
        cause instanceof Error ? cause.message : "Não foi possível capturar o frame.",
      );
    } finally {
      setCapturingFrame(false);
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

  const exportSnapshot = async (snapshot: SnapshotRecord): Promise<void> => {
    setExportingId(snapshot.id);
    setError(null);
    try {
      const result = await window.api.library.exportSnapshot(snapshot.id);
      if (!result.ok) throw new Error(result.error.message);
      if (!result.value.exported) return;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exportar a foto.");
    } finally {
      setExportingId(null);
    }
  };

  const exportRecording = async (recording: RecordingLibraryItem): Promise<void> => {
    setExportingId(recording.id);
    setError(null);
    try {
      const result = await window.api.library.exportRecording(recording.id);
      if (!result.ok) throw new Error(result.error.message);
      if (!result.value.exported) return;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exportar a gravação.");
    } finally {
      setExportingId(null);
    }
  };

  const exportClip = async (): Promise<void> => {
    if (!playingRecording || !clipStartAt || !clipEndAt) return;
    const startAt = new Date(clipStartAt).toISOString();
    const endAt = new Date(clipEndAt).toISOString();
    if (Date.parse(endAt) <= Date.parse(startAt)) {
      setPlaybackError("O fim do trecho deve ser posterior ao início.");
      return;
    }
    const jobId = crypto.randomUUID();
    setClipExportJobId(jobId);
    setPlaybackError(null);
    try {
      const result = await window.api.library.exportClip({
        id: playingRecording.id,
        jobId,
        startAt,
        endAt,
      });
      if (!result.ok) throw new Error(result.error.message);
      if (!result.value.exported) return;
      if (result.value.gaps.length > 0) {
        setPlaybackError(
          `Trecho exportado com ${result.value.gaps.length} lacuna(s) sem vídeo.`,
        );
      }
    } catch (cause) {
      setPlaybackError(
        cause instanceof Error ? cause.message : "Não foi possível exportar o trecho.",
      );
    } finally {
      setClipExportJobId(null);
    }
  };

  const cancelClipExport = async (): Promise<void> => {
    if (!clipExportJobId) return;
    const result = await window.api.library.cancelClipExport(clipExportJobId);
    if (!result.ok || !result.value.cancelled) {
      setPlaybackError(result.ok ? "A exportação não pôde ser cancelada." : result.error.message);
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
          <div className="library-field">
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
          <div className="library-period">
            <div className="library-field">
              <label className="library-filter-label" htmlFor={startDateId}>
                De
              </label>
              <input
                id={startDateId}
                className="field-input library-date-input"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="library-field">
              <label className="library-filter-label" htmlFor={startTimeId}>
                Hora
              </label>
              <input
                id={startTimeId}
                className="field-input library-time-input"
                type="time"
                value={startTime}
                disabled={!startDate}
                max={startDate === endDate ? endTime || undefined : undefined}
                onChange={(event) => {
                  setStartTime(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
          <div className="library-period">
            <div className="library-field">
              <label className="library-filter-label" htmlFor={endDateId}>
                Até
              </label>
              <input
                id={endDateId}
                className="field-input library-date-input"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="library-field">
              <label className="library-filter-label" htmlFor={endTimeId}>
                Hora
              </label>
              <input
                id={endTimeId}
                className="field-input library-time-input"
                type="time"
                value={endTime}
                disabled={!endDate}
                min={startDate === endDate ? startTime || undefined : undefined}
                onChange={(event) => {
                  setEndTime(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="library-display-controls"
        aria-label="Exibição da biblioteca"
      >
        {mode === "recordings" && (
          <div className="library-field">
            <label className="library-filter-label" htmlFor="recording-occurrence-filter">Ocorrência</label>
            <select id="recording-occurrence-filter" className="field-input library-control-input" value={occurrenceFilter} onChange={(event) => { setOccurrenceFilter(event.target.value as typeof occurrenceFilter); setCurrentPage(1); }}>
              <option value="all">Todas as gravações</option>
              <option value="with-motion">Com movimento</option>
              <option value="without-motion">Sem movimento</option>
            </select>
          </div>
        )}
        <div className="library-field">
          <label className="library-filter-label" htmlFor={sortId}>
            Ordenar
          </label>
          <select
            id={sortId}
            className="field-input library-control-input"
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value as SortOrder);
              setCurrentPage(1);
            }}
          >
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
          </select>
        </div>
        <div className="library-field">
          <label className="library-filter-label" htmlFor={layoutId}>
            Visualização
          </label>
          <select
            id={layoutId}
            className="field-input library-control-input"
            value={layout}
            onChange={(event) => setLayout(event.target.value as LibraryLayout)}
          >
            <option value="grid">Grade</option>
            <option value="list">Lista</option>
          </select>
        </div>
        <div className="library-field">
          <label className="library-filter-label" htmlFor={densityId}>
            Densidade
          </label>
          <select
            id={densityId}
            className="field-input library-control-input"
            value={density}
            onChange={(event) => setDensity(event.target.value as LibraryDensity)}
          >
            <option value="comfortable">Confortável</option>
            <option value="compact">Compacta</option>
          </select>
        </div>
        <div className="library-field">
          <label className="library-filter-label" htmlFor={pageSizeId}>
            Itens por página
          </label>
          <select
            id={pageSizeId}
            className="field-input library-control-input"
            value={pageSize}
            onChange={(event) => {
              setPageSize(
                Number(event.target.value) as (typeof PAGE_SIZES)[number],
              );
              setCurrentPage(1);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === "recordings" && (
        <section className="recording-timeline" aria-labelledby="recording-timeline-title">
          <div className="recording-timeline-header">
            <div>
              <h3 id="recording-timeline-title">Linha do tempo</h3>
              <p>Períodos gravados e ocorrências de movimento no dia.</p>
            </div>
            <div className="recording-timeline-filters">
              <div className="library-field">
                <label className="library-filter-label" htmlFor="timeline-camera">
                  <CameraIcon size={15} /> Câmera
                </label>
                <select
                  id="timeline-camera"
                  className="field-input library-control-input"
                  value={timelineCameraId}
                  onChange={(event) => setTimelineCamera(event.target.value)}
                >
                  {timelineCameraOptions.map((cameraId) => (
                    <option key={cameraId} value={cameraId}>
                      {cameraNames.get(cameraId) ?? "Câmera removida"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="library-field">
                <label className="library-filter-label" htmlFor="timeline-date">Dia</label>
                <input
                  id="timeline-date"
                  className="field-input library-date-input"
                  type="date"
                  value={effectiveTimelineDate}
                  onChange={(event) => setTimelineDate(event.target.value)}
                />
              </div>
              <div className="library-field">
                <label className="library-filter-label" htmlFor="timeline-event-state">Evento</label>
                <select id="timeline-event-state" className="field-input library-control-input" value={eventStateFilter} onChange={(event) => setEventStateFilter(event.target.value as typeof eventStateFilter)}>
                  <option value="all">Início e fim</option>
                  <option value="started">Início</option>
                  <option value="ended">Fim</option>
                </select>
              </div>
              <div className="library-field">
                <label className="library-filter-label" htmlFor="timeline-event-video">Trecho</label>
                <select id="timeline-event-video" className="field-input library-control-input" value={eventVideoFilter} onChange={(event) => setEventVideoFilter(event.target.value as typeof eventVideoFilter)}>
                  <option value="all">Todos</option>
                  <option value="with-video">Com vídeo</option>
                  <option value="without-video">Sem vídeo</option>
                </select>
              </div>
            </div>
          </div>
          {timelineError && <p className="form-message form-error" role="alert">{timelineError}</p>}
          {timelineCameraId && effectiveTimelineDate ? (
            <>
              <div className="recording-timeline-hours" aria-hidden="true">
                <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span>
              </div>
              <div className="recording-timeline-track" aria-label={`Gravações de ${cameraNames.get(timelineCameraId) ?? "câmera removida"} em ${effectiveTimelineDate}`}>
                <span className="recording-timeline-gap">Sem vídeo</span>
                {timelineSegments.map(({ recording, left, width }) => (
                  <button
                    key={recording.id}
                    type="button"
                    className={`recording-timeline-segment${recording.path ? "" : " is-missing"}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${formatDate(recording.startedAt)} · ${recording.path ? "vídeo disponível" : "arquivo indisponível"}`}
                    onClick={() => {
                      if (recording.path) {
                        setPlaybackError(null);
                        setPlayingRecording(recording);
                      } else {
                        setError("O período selecionado não possui um arquivo de vídeo disponível.");
                      }
                    }}
                  >
                    <span className="sr-only">{recording.path ? "Gravação disponível" : "Arquivo indisponível"}</span>
                  </button>
                ))}
                {visibleTimelineEvents.map((event) => {
                  const dayStart = new Date(`${effectiveTimelineDate}T00:00:00`).getTime();
                  const dayEnd = new Date(`${effectiveTimelineDate}T23:59:59.999`).getTime();
                  const left = Math.min(99, Math.max(1, (Date.parse(event.receivedAt) - dayStart) / (dayEnd - dayStart) * 100));
                  const cameraTime = Math.abs(Date.parse(event.occurredAt) - Date.parse(event.receivedAt)) > 2_000
                    ? ` · hora da câmera ${formatDate(event.occurredAt)}` : "";
                  const label = `${event.state === "started" ? "Início" : "Fim"} do movimento às ${formatDate(event.receivedAt)}${cameraTime} · ${event.hasVideo ? "vídeo vinculado" : "sem vídeo vinculado"}`;
                  return (
                    <button key={event.id} type="button" className={`recording-timeline-event${event.state === "ended" ? " is-ended" : ""}${event.hasVideo ? "" : " is-unavailable"}`} style={{ left: `${left}%` }} aria-label={label} title={label} onClick={() => void openMotionEvent(event)}>
                      <ActivityIcon size={14} />
                    </button>
                  );
                })}
              </div>
              <p className="recording-timeline-legend">
                <span><i className="recording-timeline-legend-available" /> Vídeo disponível</span>
                <span><i className="recording-timeline-legend-missing" /> Arquivo indisponível</span>
                <span><i className="recording-timeline-legend-gap" /> Lacuna sem vídeo</span>
                <span><ActivityIcon size={13} /> Movimento ONVIF</span>
              </p>
              <div className="motion-event-list" aria-label="Ocorrências de movimento">
                <p>{visibleTimelineEvents.length} {visibleTimelineEvents.length === 1 ? "ocorrência" : "ocorrências"} no filtro{timelineEvents.length >= 1_000 ? " · exibindo as 1.000 mais recentes" : ""}</p>
                {visibleTimelineEvents.map((event) => (
                  <button key={event.id} type="button" className="motion-event-row" onClick={() => void openMotionEvent(event)}>
                    <ActivityIcon size={16} />
                    <span>{event.state === "started" ? "Início" : "Fim"} · {formatDate(event.receivedAt)}</span>
                    <span className={event.hasVideo ? "motion-event-available" : "motion-event-unavailable"}>{event.hasVideo ? "Vídeo vinculado" : "Sem vídeo"}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="recording-timeline-empty">Não há gravações para formar a linha do tempo.</p>
          )}
        </section>
      )}

      {items.length > 0 && (
        <div className="library-selection-bar" aria-label="Ações em lote">
          <label className="library-selection-toggle">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleVisibleSelection}
            />
            Selecionar itens da página
          </label>
          <span className="library-selection-count" aria-live="polite">
            {selectedIds.size} selecionados
          </span>
          <div className="library-selection-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={selectedIds.size === 0 || batchAction !== null}
              onClick={() => void applyBatchMetadata("favorite", true)}
            >
              <HeartIcon size={15} />
              Favoritar
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={selectedIds.size === 0 || batchAction !== null}
              onClick={() => void applyBatchMetadata("favorite", false)}
            >
              <HeartIcon size={15} />
              Remover favorito
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={selectedIds.size === 0 || batchAction !== null}
              onClick={() => void applyBatchMetadata("protected", true)}
            >
              <ShieldIcon size={15} />
              Proteger arquivos
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={selectedIds.size === 0 || batchAction !== null}
              onClick={() => void applyBatchMetadata("protected", false)}
            >
              <ShieldIcon size={15} />
              Remover proteção
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={selectedIds.size === 0 || batchAction !== null}
              onClick={() => setSelectedIds(new Set())}
            >
              <CloseIcon size={15} />
              Limpar seleção
            </button>
          </div>
          {batchResult && <span className="library-batch-result">{batchResult}</span>}
        </div>
      )}

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
            className={`library-list${mode === "snapshots" ? " snapshot-list" : ""}${layout === "list" ? " is-list" : ""}${density === "compact" ? " is-compact" : ""}`}
          >
            {mode === "snapshots"
              ? visibleSnapshots.map((snapshot, index) => (
                  <Fragment key={snapshot.id}>
                    {beginsDayGroup(visibleSnapshots, index) && (
                      <li className="library-day-heading">
                        {formatDayHeading(snapshot.capturedAt)}
                      </li>
                    )}
                    <li
                      className={`library-item media-card snapshot-card${selectedIds.has(snapshot.id) ? " is-selected" : ""}`}
                    >
                      <label className="library-item-select">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(snapshot.id)}
                          onChange={() => toggleSelection(snapshot.id)}
                        />
                        <span className="sr-only">Selecionar foto</span>
                      </label>
                      <button
                        type="button"
                        className="snapshot-preview"
                        aria-label={`Abrir foto de ${cameraNames.get(snapshot.cameraId) ?? "Câmera removida"}, capturada em ${formatDate(snapshot.capturedAt)}`}
                        onClick={() => openSnapshotViewer(snapshot)}
                      >
                        <SnapshotPreview
                          snapshotId={snapshot.id}
                          cameraName={
                            cameraNames.get(snapshot.cameraId) ??
                            "Câmera removida"
                          }
                        />
                      </button>
                      <div className="media-card-header">
                        <span className="library-item-icon">
                          <CameraIcon size={18} />
                        </span>
                        <div className="media-card-heading">
                          <h3
                            className="media-card-title"
                            title={
                              cameraNames.get(snapshot.cameraId) ??
                              "Câmera removida"
                            }
                          >
                            {cameraNames.get(snapshot.cameraId) ??
                              "Câmera removida"}
                          </h3>
                          <div className="media-card-capture">
                            <span className="sr-only">Capturada em</span>
                            <time dateTime={snapshot.capturedAt}>
                              {formatDate(snapshot.capturedAt)}
                            </time>
                          </div>
                        </div>
                      </div>
                      <div className="library-item-metadata" aria-label="Estado do item">
                        {metadataById.get(snapshot.id)?.favorite && (
                          <span title="Favorito"><HeartIcon size={14} /> Favorito</span>
                        )}
                        {metadataById.get(snapshot.id)?.protected && (
                          <span title="Protegido contra exclusão"><ShieldIcon size={14} /> Protegido</span>
                        )}
                      </div>
                      <div className="media-card-actions">
                        <button
                          type="button"
                          className="btn btn-secondary media-card-open"
                          onClick={() => openSnapshotViewer(snapshot)}
                        >
                          <ImageIcon size={16} />
                          Abrir foto
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label={exportingId === snapshot.id ? "Exportando foto" : "Exportar foto"}
                          title={exportingId === snapshot.id ? "Exportando foto…" : "Exportar foto"}
                          disabled={exportingId === snapshot.id}
                          onClick={() => void exportSnapshot(snapshot)}
                        >
                          <ExportIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label="Abrir pasta da foto"
                          title="Abrir pasta da foto"
                          onClick={() => void window.api.library.revealSnapshot(snapshot.id)}
                        >
                          <FolderIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-danger media-card-delete"
                          aria-label={deletingId === snapshot.id ? "Excluindo foto" : "Excluir foto"}
                          title={deletingId === snapshot.id ? "Excluindo foto…" : "Excluir foto"}
                          disabled={deletingId === snapshot.id}
                          onClick={() => void deleteSnapshot(snapshot)}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </li>
                  </Fragment>
                ))
              : visibleRecordings.map((recording, index) => (
                  <Fragment key={recording.id}>
                    {beginsDayGroup(visibleRecordings, index) && (
                      <li className="library-day-heading">
                        {formatDayHeading(recording.startedAt)}
                      </li>
                    )}
                    <li
                      className={`library-item media-card recording-card${selectedIds.has(recording.id) ? " is-selected" : ""}`}
                    >
                      <label className="library-item-select">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(recording.id)}
                          onChange={() => toggleSelection(recording.id)}
                        />
                        <span className="sr-only">Selecionar gravação</span>
                      </label>
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
                      <div className="media-card-header">
                        <span className="library-item-icon">
                          <CameraIcon size={18} />
                        </span>
                        <div className="media-card-heading">
                          <h3
                            className="media-card-title"
                            title={cameraNames.get(recording.cameraId) ?? "Câmera removida"}
                          >
                            {cameraNames.get(recording.cameraId) ?? "Câmera removida"}
                          </h3>
                          <div className="media-card-capture">
                            <time dateTime={recording.startedAt}>
                              {formatDate(recording.startedAt)}
                            </time>
                            <span>Duração: {formatDuration(recording.durationMs)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="recording-card-details">
                        <p
                          className={`library-item-file-status${recording.path ? " library-item-file-available" : " library-item-file-missing"}`}
                        >
                          <VideoIcon size={14} />
                          {recording.path
                            ? "Vídeo disponível"
                            : "Arquivo de vídeo não gerado"}
                        </p>
                        <div className="library-item-metadata" aria-label="Estado do item">
                          {metadataById.get(recording.id)?.favorite && (
                            <span title="Favorito"><HeartIcon size={14} /> Favorito</span>
                          )}
                          {metadataById.get(recording.id)?.protected && (
                            <span title="Protegido contra exclusão"><ShieldIcon size={14} /> Protegido</span>
                          )}
                        </div>
                      </div>
                      <div className="media-card-actions">
                        <button
                          type="button"
                          className="btn btn-secondary media-card-open"
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
                          className="btn btn-secondary"
                          disabled={!recording.path}
                          onClick={() => setSynchronizedRecording(recording)}
                        >
                          <VideoIcon size={16} />
                          Sincronizar
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label={exportingId === recording.id ? "Exportando gravação" : "Exportar gravação"}
                          title={exportingId === recording.id ? "Exportando gravação…" : "Exportar gravação"}
                          disabled={exportingId === recording.id || !recording.path}
                          onClick={() => void exportRecording(recording)}
                        >
                          <ExportIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label="Abrir pasta da gravação"
                          title="Abrir pasta da gravação"
                          disabled={!recording.path}
                          onClick={() => void window.api.library.revealRecording(recording.id)}
                        >
                          <FolderIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-danger media-card-delete"
                          aria-label={deletingId === recording.id ? "Excluindo gravação" : "Excluir gravação"}
                          title={deletingId === recording.id ? "Excluindo gravação…" : "Excluir gravação"}
                          disabled={deletingId === recording.id}
                          onClick={() => void deleteRecording(recording)}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </li>
                  </Fragment>
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
      {synchronizedRecording && (
        <SynchronizedPlayback
          anchorAt={synchronizedRecording.startedAt}
          cameras={synchronizedCameras}
          onClose={() => setSynchronizedRecording(null)}
        />
      )}
      {playingRecording?.path && (
        <div
          className="modal-backdrop recording-player-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              playerRef.current?.pause();
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
                {playingSegments.length > 0 && (
                  <p>
                    Segmento {playingSegmentIndex + 1} de {playingSegments.length}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn btn-icon recording-player-close"
                ref={playbackCloseRef}
                aria-label="Fechar reprodução"
                title="Fechar"
                onClick={() => {
                  playerRef.current?.pause();
                  setPlayingRecording(null);
                }}
              >
                <CloseIcon size={18} />
              </button>
            </header>
            {playbackUrl ? (
              <video
                key={playbackUrl}
                className="recording-player-video"
                src={playbackUrl}
                ref={playerRef}
                controls
                autoPlay
                playsInline
                onLoadedMetadata={() => {
                  if (pendingSeekSeconds === null || !playerRef.current) return;
                  playerRef.current.currentTime = Math.min(
                    pendingSeekSeconds,
                    Math.max(0, playerRef.current.duration - 0.1),
                  );
                  setPendingSeekSeconds(null);
                }}
                onEnded={() => {
                  if (playingSegmentIndex + 1 < playingSegments.length) {
                    setPendingSeekSeconds(null);
                    setPlayingSegmentIndex((index) => index + 1);
                  }
                }}
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
              <label className="library-filter-label" htmlFor="recording-seek-time">
                Ir para horário
              </label>
              <input
                id="recording-seek-time"
                className="field-input library-time-input"
                type="time"
                value={playbackSeekTime}
                onChange={(event) => setPlaybackSeekTime(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!playbackSeekTime || playingSegments.length === 0}
                onClick={seekRecordingToTime}
              >
                <VideoIcon size={16} />
                Buscar horário
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!playbackUrl || capturingFrame}
                onClick={() => void capturePlaybackFrame()}
              >
                <ImageIcon size={16} />
                {capturingFrame ? "Capturando…" : "Capturar frame"}
              </button>
              <span className="recording-clip-divider" aria-hidden="true" />
              <label className="library-filter-label" htmlFor="recording-clip-start">
                Início do trecho
              </label>
              <input
                id="recording-clip-start"
                className="field-input recording-clip-input"
                type="datetime-local"
                value={clipStartAt}
                max={clipEndAt || undefined}
                onChange={(event) => setClipStartAt(event.target.value)}
              />
              <label className="library-filter-label" htmlFor="recording-clip-end">
                Fim do trecho
              </label>
              <input
                id="recording-clip-end"
                className="field-input recording-clip-input"
                type="datetime-local"
                value={clipEndAt}
                min={clipStartAt || undefined}
                onChange={(event) => setClipEndAt(event.target.value)}
              />
              {clipExportJobId ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void cancelClipExport()}
                >
                  <CloseIcon size={16} />
                  Cancelar exportação ({clipExportPercent}%)
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!clipStartAt || !clipEndAt || playingSegments.length === 0}
                  onClick={() => void exportClip()}
                >
                  <ExportIcon size={16} />
                  Exportar trecho MP4
                </button>
              )}
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
      {viewingSnapshot && (
        <div
          className="modal-backdrop recording-player-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewingSnapshot(null);
          }}
        >
          <section
            className="modal recording-player-modal snapshot-viewer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="snapshot-viewer-title"
          >
            <header className="recording-player-header">
              <div>
                <h3 id="snapshot-viewer-title">Visualizar snapshot</h3>
                <p>
                  {cameraNames.get(viewingSnapshot.cameraId) ?? "Câmera removida"} · {formatDate(viewingSnapshot.capturedAt)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-icon recording-player-close"
                ref={snapshotCloseRef}
                aria-label="Fechar visualizador"
                title="Fechar"
                onClick={() => setViewingSnapshot(null)}
              >
                <CloseIcon size={18} />
              </button>
            </header>
            <div className={`snapshot-viewer-images${comparedSnapshot ? " is-comparing" : ""}`}>
              <figure>
                <img
                  src={`app://renderer/media/snapshots/${encodeURIComponent(viewingSnapshot.id)}`}
                  alt={`Snapshot de ${cameraNames.get(viewingSnapshot.cameraId) ?? "câmera removida"}`}
                  style={{ transform: `scale(${snapshotZoom})` }}
                />
                <figcaption>Imagem selecionada</figcaption>
              </figure>
              {comparedSnapshot && (
                <figure>
                  <img
                    src={`app://renderer/media/snapshots/${encodeURIComponent(comparedSnapshot.id)}`}
                    alt={`Snapshot comparado de ${cameraNames.get(comparedSnapshot.cameraId) ?? "câmera removida"}`}
                  />
                  <figcaption>{formatDate(comparedSnapshot.capturedAt)}</figcaption>
                </figure>
              )}
            </div>
            <div className="snapshot-viewer-controls">
              <button type="button" className="btn btn-secondary" disabled={viewingSnapshotIndex <= 0} onClick={() => navigateSnapshot(-1)}>
                <ChevronLeftIcon size={16} /> Anterior
              </button>
              <button type="button" className="btn btn-secondary" disabled={snapshotZoom <= 1} onClick={() => setSnapshotZoom((zoom) => Math.max(1, zoom - 0.25))}>
                <ChevronLeftIcon size={16} /> Reduzir zoom
              </button>
              <button type="button" className="btn btn-secondary" disabled={snapshotZoom >= 3} onClick={() => setSnapshotZoom((zoom) => Math.min(3, zoom + 0.25))}>
                <ChevronRightIcon size={16} /> Ampliar zoom
              </button>
              <label className="library-filter-label" htmlFor="snapshot-compare">
                <ImageIcon size={15} /> Comparar com
              </label>
              <select id="snapshot-compare" className="field-input library-control-input" value={compareSnapshotId} onChange={(event) => setCompareSnapshotId(event.target.value)}>
                <option value="">Sem comparação</option>
                {sortedSnapshots.filter((snapshot) => snapshot.id !== viewingSnapshot.id).map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>{formatDate(snapshot.capturedAt)}</option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" disabled={viewingSnapshotIndex >= sortedSnapshots.length - 1} onClick={() => navigateSnapshot(1)}>
                Próxima <ChevronRightIcon size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
