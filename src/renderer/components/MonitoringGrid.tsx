import { useMemo, useRef, useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import {
  CameraIcon,
  DashboardIcon,
  RecIcon,
  MaximizeIcon,
  ImageIcon,
  EditIcon,
  MoveIcon,
  CheckIcon,
} from "../icons.js";
import { useAppStore } from "../store/appStore.js";
import { LiveVideo } from "./LiveVideo.js";

export type GridLayout = 2 | 3 | 4;

const LAYOUT_OPTIONS: Array<{ value: GridLayout; label: string }> = [
  { value: 2, label: "2×2" },
  { value: 3, label: "3×3" },
  { value: 4, label: "4×4" },
];

const CAMERA_LAYOUT_STORAGE_KEY = "simple-dvr-wifi:live-camera-layout";

type CameraLayoutSlots = Record<GridLayout, Array<string | null>>;

function loadCameraLayout(): CameraLayoutSlots {
  const emptyLayout: CameraLayoutSlots = { 2: [], 3: [], 4: [] };

  try {
    const stored = window.localStorage.getItem(CAMERA_LAYOUT_STORAGE_KEY);
    const value: unknown = stored ? JSON.parse(stored) : [];
    if (Array.isArray(value)) {
      const legacyOrder = value.filter(
        (cameraId): cameraId is string => typeof cameraId === "string",
      );
      return { 2: legacyOrder, 3: legacyOrder, 4: legacyOrder };
    }
    if (!value || typeof value !== "object") return emptyLayout;

    const savedLayout = value as Partial<CameraLayoutSlots>;
    return {
      2: Array.isArray(savedLayout[2]) ? savedLayout[2] : [],
      3: Array.isArray(savedLayout[3]) ? savedLayout[3] : [],
      4: Array.isArray(savedLayout[4]) ? savedLayout[4] : [],
    };
  } catch {
    return emptyLayout;
  }
}

interface LayoutSwitcherProps {
  layout: GridLayout;
  onChange: (layout: GridLayout) => void;
}

export function LayoutSwitcher({
  layout,
  onChange,
}: LayoutSwitcherProps): React.JSX.Element {
  return (
    <div className="layout-control">
      <span className="layout-label">
        <DashboardIcon size={14} />
        Grid:
      </span>
      <div
        className="layout-switcher"
        role="group"
        aria-label="Colunas da grade"
      >
        {LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`layout-btn${layout === option.value ? " layout-btn-active" : ""}`}
            aria-pressed={layout === option.value}
            aria-label={`Grade ${option.label}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface MonitoringTileProps {
  camera: CameraSummary | null;
  position: number;
  reorderMode: boolean;
  isDragging: boolean;
  isDragTarget: boolean;
  onFullscreen: (camera: CameraSummary) => void;
  onPtzSelect: (camera: CameraSummary) => void;
  onEdit: (camera: CameraSummary) => void;
  onStartReordering: () => void;
  onDragCamera: (cameraId: string) => void;
  onDragTarget: (position: number) => void;
  onDragEnd: () => void;
  onDropCamera: (cameraId: string, position: number) => void;
  selectedPtzCameraId: string | null;
}

function MonitoringTile({
  camera,
  position,
  reorderMode,
  isDragging,
  isDragTarget,
  onFullscreen,
  onPtzSelect,
  onEdit,
  onStartReordering,
  onDragCamera,
  onDragTarget,
  onDragEnd,
  onDropCamera,
  selectedPtzCameraId,
}: MonitoringTileProps): React.JSX.Element {
  const [localRecording, setLocalRecording] = useState(false);
  const dragPreviewRef = useRef<HTMLElement | null>(null);

  const removeDragPreview = (): void => {
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
  };

  if (!camera) {
    return (
      <div
        className={`monitor-tile monitor-tile-empty${reorderMode ? " monitor-tile-drop-target" : ""}${isDragTarget ? " monitor-tile-drop-active" : ""}`}
        role="listitem"
        onDragOver={(event) => {
          if (!reorderMode) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={() => onDragTarget(position)}
        onDrop={(event) => {
          event.preventDefault();
          onDropCamera(event.dataTransfer.getData("text/plain"), position);
        }}
      >
        {reorderMode && (
          <span className="monitor-tile-empty-label">
            <MoveIcon size={18} />
            Solte a câmera aqui
          </span>
        )}
      </div>
    );
  }

  const recording =
    localRecording ||
    camera.recordingStatus === "recording" ||
    camera.recordingStatus === "starting";

  const toggleRecording = (): void => {
    if (recording) {
      void window.api.recordings.stop(camera.id).then((result) => {
        if (result.ok && result.value.stopped) setLocalRecording(false);
        else console.error("Falha ao finalizar a gravação.");
      });
    } else {
      void window.api.recordings.start(camera.id).then((result) => {
        if (result.ok && result.value.writeAllowed) setLocalRecording(true);
        else
          console.error(
            result.ok ? "Não foi possível gravar." : result.error.message,
          );
      });
    }
  };

  const captureSnapshot = (): void => {
    void window.api.snapshots
      .capture({ cameraId: camera.id })
      .then((result) => {
        if (!result.ok) console.error("Falha no snapshot");
      });
  };

  return (
    <article
      className={`monitor-tile${selectedPtzCameraId === camera.id ? " monitor-tile-selected" : ""}${reorderMode ? " monitor-tile-reordering" : ""}${isDragging ? " monitor-tile-dragging" : ""}`}
      role="listitem"
      aria-label={`Vídeo da câmera ${camera.name}`}
      draggable={reorderMode}
      onClick={() => {
        if (!reorderMode) onPtzSelect(camera);
      }}
      onDragStart={(event) => {
        if (!reorderMode) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", camera.id);
        const cardBounds = event.currentTarget.getBoundingClientRect();
        const dragPreview = event.currentTarget.cloneNode(true) as HTMLElement;
        dragPreview.classList.remove("monitor-tile-dragging");
        dragPreview.classList.add("monitor-tile-drag-preview");
        dragPreview.style.width = `${cardBounds.width}px`;
        dragPreview.style.height = `${cardBounds.height}px`;
        dragPreview.style.left = `${event.clientX - cardBounds.width / 2}px`;
        dragPreview.style.top = `${event.clientY - cardBounds.height / 2}px`;
        const sourceVideo =
          event.currentTarget.querySelector<HTMLVideoElement>("video");
        const previewVideo =
          dragPreview.querySelector<HTMLVideoElement>("video");
        if (sourceVideo && previewVideo && sourceVideo.readyState >= 2) {
          try {
            const frame = document.createElement("canvas");
            frame.width = sourceVideo.videoWidth;
            frame.height = sourceVideo.videoHeight;
            frame.getContext("2d")?.drawImage(sourceVideo, 0, 0);
            const image = document.createElement("img");
            image.className = "monitor-tile-drag-preview-frame";
            image.alt = "";
            image.src = frame.toDataURL("image/jpeg", 0.9);
            previewVideo.replaceWith(image);
          } catch {
            // Mantém o preview do card caso o frame ainda não esteja disponível.
          }
        }
        document.body.appendChild(dragPreview);
        dragPreviewRef.current = dragPreview;
        const transparentDragImage = document.createElement("canvas");
        transparentDragImage.width = 1;
        transparentDragImage.height = 1;
        event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
        onDragCamera(camera.id);
      }}
      onDrag={(event) => {
        if (
          !dragPreviewRef.current ||
          event.clientX === 0 ||
          event.clientY === 0
        )
          return;
        dragPreviewRef.current.style.left = `${event.clientX - dragPreviewRef.current.offsetWidth / 2}px`;
        dragPreviewRef.current.style.top = `${event.clientY - dragPreviewRef.current.offsetHeight / 2}px`;
      }}
      onDragEnd={() => {
        removeDragPreview();
        onDragEnd();
      }}
      onDragOver={(event) => {
        if (!reorderMode) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={() => onDragTarget(position)}
      onDrop={(event) => {
        event.preventDefault();
        onDropCamera(event.dataTransfer.getData("text/plain"), position);
      }}
    >
      <div className="monitor-video">
        <LiveVideo
          cameraId={camera.id}
          cameraName={camera.name}
          profile="sub"
        />
        <button
          type="button"
          className="btn-icon tile-arrange-action"
          aria-label="Organizar posição das câmeras"
          onClick={(event) => {
            event.stopPropagation();
            onStartReordering();
          }}
        >
          <MoveIcon size={15} />
        </button>
        <button
          type="button"
          className="btn-icon tile-edit-action"
          aria-label={`Editar ${camera.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(camera);
          }}
        >
          <EditIcon size={15} />
        </button>
        <div className="tile-actions">
          <button
            type="button"
            className="btn-icon"
            aria-label={`Capturar snapshot de ${camera.name}`}
            onClick={captureSnapshot}
          >
            <ImageIcon size={15} />
          </button>
          <button
            type="button"
            className={`btn-icon${recording ? " btn-icon-recording" : ""}`}
            aria-label={
              recording
                ? `Parar gravação de ${camera.name}`
                : `Gravar ${camera.name}`
            }
            onClick={toggleRecording}
          >
            <RecIcon size={15} />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={`Abrir ${camera.name} em tela cheia`}
            onClick={() => onFullscreen(camera)}
          >
            <MaximizeIcon size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

interface MonitoringGridProps {
  cameras: CameraSummary[];
  layout: GridLayout;
  onOpenFullscreen: (camera: CameraSummary, profile: "main" | "sub") => void;
  onPtzSelect: (camera: CameraSummary) => void;
  onEdit: (camera: CameraSummary) => void;
  selectedPtzCameraId: string | null;
}

export function MonitoringGrid({
  cameras,
  layout,
  onOpenFullscreen,
  onPtzSelect,
  onEdit,
  selectedPtzCameraId,
}: MonitoringGridProps): React.JSX.Element {
  const fullscreen = useAppStore((state) => state.fullscreenCamera);
  const [cameraLayout, setCameraLayout] =
    useState<CameraLayoutSlots>(loadCameraLayout);
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingCameraId, setDraggingCameraId] = useState<string | null>(null);
  const [dragTargetPosition, setDragTargetPosition] = useState<number | null>(
    null,
  );
  const gridSlots = useMemo(() => {
    const activeCameras = cameras.filter((camera) => camera.active);
    const camerasById = new Map(
      activeCameras.map((camera) => [camera.id, camera]),
    );
    const savedSlots = cameraLayout[layout];
    const usedCameraIds = new Set<string>();
    const slots = savedSlots.map((cameraId) => {
      if (!cameraId || usedCameraIds.has(cameraId)) return null;
      const camera = camerasById.get(cameraId);
      if (!camera) return null;
      usedCameraIds.add(cameraId);
      return camera;
    });
    const unplacedCameras = activeCameras.filter(
      (camera) => !usedCameraIds.has(camera.id),
    );
    for (const camera of unplacedCameras) {
      const emptyPosition = slots.findIndex((slot) => slot === null);
      if (emptyPosition === -1) slots.push(camera);
      else slots[emptyPosition] = camera;
    }
    const minimumSlots = layout * layout;
    const fullRows = Math.ceil(activeCameras.length / layout) * layout;
    const slotCount = Math.max(minimumSlots, fullRows);

    return Array.from(
      { length: slotCount },
      (_, index) => slots[index] ?? null,
    );
  }, [cameraLayout, cameras, layout]);
  const activeCameraCount = cameras.filter((camera) => camera.active).length;

  const handleDropCamera = (
    droppedCameraId: string,
    targetPosition: number,
  ): void => {
    const cameraId = droppedCameraId || draggingCameraId;
    if (!cameraId) return;

    const sourcePosition = gridSlots.findIndex(
      (camera) => camera?.id === cameraId,
    );
    if (sourcePosition === -1) return;

    const nextSlots = gridSlots.map((camera) => camera?.id ?? null);
    const targetCameraId = nextSlots[targetPosition] ?? null;
    nextSlots[sourcePosition] = targetCameraId;
    nextSlots[targetPosition] = cameraId;
    setCameraLayout((currentLayout) => {
      const nextLayout = { ...currentLayout, [layout]: nextSlots };
      window.localStorage.setItem(
        CAMERA_LAYOUT_STORAGE_KEY,
        JSON.stringify(nextLayout),
      );
      return nextLayout;
    });
    setDraggingCameraId(null);
    setDragTargetPosition(null);
  };

  return (
    <section aria-label="Monitoramento ao vivo" className="monitoring">
      {reorderMode && (
        <div className="reorder-mode-bar" role="status">
          <span>
            <MoveIcon size={16} />
            Arraste as câmeras para organizar a Live.
          </span>
          <button
            type="button"
            className="btn btn-sm reorder-mode-confirm"
            onClick={() => setReorderMode(false)}
          >
            <CheckIcon size={15} />
            Concluir
          </button>
        </div>
      )}
      {activeCameraCount === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <CameraIcon size={24} />
          </span>
          <h3 className="empty-state-title">Nenhuma câmera ativa</h3>
          <p className="empty-state-text">
            Cadastre ou ative câmeras para começar o monitoramento ao vivo.
          </p>
        </div>
      ) : (
        <div
          className={`monitor-grid monitor-grid-${layout}${reorderMode ? " monitor-grid-reordering" : ""}`}
          role="list"
          style={{
            gridTemplateRows: `repeat(${Math.ceil(gridSlots.length / layout)}, minmax(0, 1fr))`,
          }}
        >
          {gridSlots.map((camera, index) => (
            <MonitoringTile
              key={camera?.id ?? `slot-${index}`}
              camera={camera}
              position={index}
              reorderMode={reorderMode}
              isDragging={draggingCameraId === camera?.id}
              isDragTarget={dragTargetPosition === index}
              onFullscreen={(cam) => {
                if (!fullscreen) onOpenFullscreen(cam, "main");
              }}
              onPtzSelect={onPtzSelect}
              onEdit={onEdit}
              onStartReordering={() => setReorderMode(true)}
              onDragCamera={setDraggingCameraId}
              onDragTarget={setDragTargetPosition}
              onDragEnd={() => {
                setDraggingCameraId(null);
                setDragTargetPosition(null);
              }}
              onDropCamera={handleDropCamera}
              selectedPtzCameraId={selectedPtzCameraId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
