import { useCallback, useEffect, useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import { CameraTable } from "./CameraTable.js";
import { CameraForm } from "./CameraForm.js";
import { PlusIcon } from "../icons.js";
import type { CameraDraft } from "./camera-types.js";
import { runCameraMutation } from "../store/appStore.js";

interface CamerasViewProps {
  cameras: CameraSummary[];
  onRefresh: () => void;
  initialDraft?: CameraDraft | null;
  onDraftConsumed?: () => void;
  editCameraId?: string | null;
  onEditCameraConsumed?: () => void;
}

export function CamerasView({
  cameras,
  onRefresh,
  initialDraft,
  onDraftConsumed,
  editCameraId,
  onEditCameraConsumed,
}: CamerasViewProps): React.JSX.Element {
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    draft: CameraDraft;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [testMessage, setTestMessage] = useState<{
    kind: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const hasPendingDraft = initialDraft !== undefined && initialDraft !== null;
  const showForm = editing !== null || creating || hasPendingDraft;

  const openCameraEditor = useCallback((cameraId: string): void => {
    void window.api.cameras.details(cameraId).then((result) => {
      if (!result.ok) {
        setTestMessage({ kind: "error", text: result.error.message });
        return;
      }
      setEditing({
        id: cameraId,
        name: result.value.name,
        draft: {
          name: result.value.name,
          host: result.value.host,
          port: result.value.port,
          onvifUrl: result.value.onvifUrl,
          rtspUrl: result.value.rtspUrl,
          rtspSubUrl: result.value.rtspSubUrl,
          snapshotUrl: result.value.snapshotUrl,
          username: result.value.username,
          manufacturer: result.value.manufacturer,
          model: result.value.model,
          serialNumber: result.value.serialNumber,
        },
      });
    });
  }, []);

  const handleEdit = (camera: CameraSummary): void => {
    openCameraEditor(camera.id);
  };

  useEffect(() => {
    if (!editCameraId) return;

    openCameraEditor(editCameraId);
    onEditCameraConsumed?.();
  }, [editCameraId, onEditCameraConsumed, openCameraEditor]);

  const handleSaved = (): void => {
    setEditing(null);
    setCreating(false);
    onDraftConsumed?.();
    onRefresh();
  };

  if (showForm) {
    const formDraft: CameraDraft | undefined =
      editing !== null
        ? editing.draft
        : hasPendingDraft
          ? (initialDraft as CameraDraft)
          : undefined;

    return (
      <div className="panel camera-editor-panel">
        <h2 className="panel-title">
          {editing !== null ? `Editar ${editing.name}` : "Nova câmera"}
        </h2>
        <CameraForm
          initial={formDraft}
          editingId={editing?.id ?? null}
          onSaved={handleSaved}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
            onDraftConsumed?.();
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="section-heading camera-list-heading">
        <h2 className="section-title">Câmeras cadastradas</h2>
        <div className="camera-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating(true)}
          >
            <PlusIcon size={16} />
            Adicionar manualmente
          </button>
        </div>
      </div>

      {cameras.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <PlusIcon size={24} />
          </span>
          <h3 className="empty-state-title">Nenhuma câmera</h3>
          <p className="empty-state-text">
            Cadastre manualmente informando IP e credenciais.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating(true)}
          >
            <PlusIcon size={16} />
            Adicionar câmera
          </button>
        </div>
      ) : (
        <>
          {testMessage && (
            <p
              className={`form-message form-${testMessage.kind}`}
              role="status"
            >
              {testMessage.text}
            </p>
          )}
          <CameraTable
            cameras={cameras}
            onEdit={handleEdit}
            onToggle={async (camera) => {
              if (!camera.active) {
                await runCameraMutation({ kind: "reactivate", id: camera.id });
              } else {
                await runCameraMutation({ kind: "deactivate", id: camera.id });
              }
              onRefresh();
            }}
            onRemove={() => onRefresh()}
            onTest={(camera) => {
              setTestMessage({
                kind: "info",
                text: `Testando ${camera.name}…`,
              });
              void window.api.cameras.test(camera.id).then((result) => {
                if (!result.ok) {
                  setTestMessage({ kind: "error", text: result.error.message });
                  return;
                }
                const details = result.value.segments
                  .map(
                    (segment) =>
                      `${segment.name.toUpperCase()}: ${segment.detail}`,
                  )
                  .join(" ");
                setTestMessage({
                  kind:
                    result.value.status === "connected" ? "success" : "error",
                  text: details,
                });
                onRefresh();
              });
            }}
          />
        </>
      )}
    </>
  );
}
