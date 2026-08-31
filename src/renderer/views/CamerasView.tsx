import { useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import { CameraTable } from "./CameraTable.js";
import { CameraForm } from "./CameraForm.js";
import { PlusIcon } from "../icons.js";
import type { CameraDraft } from "./camera-types.js";

interface CamerasViewProps {
  cameras: CameraSummary[];
  onRefresh: () => void;
  onNavigateToDiscovery: () => void;
  initialDraft?: CameraDraft | null;
  onDraftConsumed?: () => void;
}

export function CamerasView({
  cameras,
  onRefresh,
  onNavigateToDiscovery,
  initialDraft,
  onDraftConsumed,
}: CamerasViewProps): React.JSX.Element {
  const [editing, setEditing] = useState<CameraSummary | null>(null);
  const [creating, setCreating] = useState(false);

  const hasPendingDraft = initialDraft !== undefined && initialDraft !== null;
  const showForm = editing !== null || creating || hasPendingDraft;

  const handleEdit = (camera: CameraSummary): void => {
    setEditing(camera);
  };

  const handleSaved = (): void => {
    setEditing(null);
    setCreating(false);
    onDraftConsumed?.();
    onRefresh();
  };

  if (showForm) {
    const formDraft: CameraDraft | undefined =
      editing !== null
        ? {
            name: editing.name,
            host: editing.host,
            onvifUrl: null,
            rtspUrl: null,
            username: null,
            password: "",
          }
        : hasPendingDraft
          ? (initialDraft as CameraDraft)
          : undefined;

    return (
      <div className="panel">
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
      <div className="section-heading">
        <h2 className="section-title">Câmeras cadastradas</h2>
        <div className="camera-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onNavigateToDiscovery}
          >
            Descobrir na rede
          </button>
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
            Cadastre manualmente informando IP e credenciais, ou use a
            descoberta ONVIF na rede local.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating(true)}
          >
            Adicionar câmera
          </button>
        </div>
      ) : (
        <CameraTable
          cameras={cameras}
          onEdit={handleEdit}
          onToggle={async (camera) => {
            if (camera.status === "disabled") {
              await window.api.cameras.reactivate(camera.id);
            } else {
              await window.api.cameras.deactivate(camera.id);
            }
            onRefresh();
          }}
          onRemove={() => onRefresh()}
          onTest={() => undefined}
        />
      )}
    </>
  );
}
