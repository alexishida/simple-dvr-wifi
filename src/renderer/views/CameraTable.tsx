import { useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import type { CameraDraft } from "./camera-types.js";
import { CameraIcon, KeyIcon, BoltIcon, RecIcon } from "../icons.js";
import {
  cameraStatusLabel,
  cameraStatusTone,
  recordingStatusLabel,
} from "../status.js";

interface CameraRowProps {
  camera: CameraSummary;
  onEdit: (camera: CameraSummary) => void;
  onToggle: (camera: CameraSummary) => void;
  onRemove: (camera: CameraSummary) => void;
  onTest: (camera: CameraSummary) => void;
}

function CameraRow({
  camera,
  onEdit,
  onToggle,
  onRemove,
  onTest,
}: CameraRowProps): React.JSX.Element {
  const active = camera.active;
  return (
    <tr>
      <td>
        <div className="camera-cell-name">{camera.name}</div>
        <div className="camera-cell-host">{camera.host}</div>
      </td>
      <td>
        <span
          className={`status-badge status-${cameraStatusTone(camera.status)}`}
        >
          <span className="status-dot" aria-hidden="true" />
          {cameraStatusLabel(camera.status)}
        </span>
      </td>
      <td>
        <div className="camera-meta">
          {camera.recordingStatus === "recording" && (
            <span className="meta-chip">
              <RecIcon size={14} />
              {recordingStatusLabel(camera.recordingStatus)}
            </span>
          )}
          {camera.hasCredential && (
            <span className="meta-chip">
              <KeyIcon size={14} />
              Credencial
            </span>
          )}
          {camera.supportsPtz && (
            <span className="meta-chip">
              <BoltIcon size={14} />
              PTZ
            </span>
          )}
        </div>
      </td>
      <td>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onTest(camera)}
          >
            Testar
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit(camera)}
          >
            Editar
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onToggle(camera)}
          >
            {active ? "Desativar" : "Ativar"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-danger"
            onClick={() => onRemove(camera)}
          >
            Remover
          </button>
        </div>
      </td>
    </tr>
  );
}

interface CameraTableProps {
  cameras: CameraSummary[];
  onEdit: (camera: CameraSummary) => void;
  onToggle: (camera: CameraSummary) => void;
  onRemove: (camera: CameraSummary) => void;
  onTest: (camera: CameraSummary) => void;
}

export function CameraTable({
  cameras,
  onEdit,
  onToggle,
  onRemove,
  onTest,
}: CameraTableProps): React.JSX.Element {
  const [selected, setSelected] = useState<CameraSummary | null>(null);

  const handleRemove = (camera: CameraSummary): void => {
    setSelected(camera);
  };

  const confirmRemove = async (): Promise<void> => {
    if (!selected) return;
    await window.api.cameras.remove(selected.id);
    setSelected(null);
    onRemove(selected);
  };

  return (
    <>
      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Câmera</th>
              <th scope="col">Status</th>
              <th scope="col">Capacidades</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((camera) => (
              <CameraRow
                key={camera.id}
                camera={camera}
                onEdit={onEdit}
                onToggle={onToggle}
                onRemove={handleRemove}
                onTest={onTest}
              />
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-title"
          >
            <span className="empty-state-icon">
              <CameraIcon size={24} />
            </span>
            <h3 className="panel-title" id="remove-title">
              Remover {selected.name}?
            </h3>
            <p className="empty-state-text">
              O cadastro, credenciais e recursos ativos desta câmera serão
              encerrados. Outras câmeras não serão afetadas.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelected(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-danger"
                onClick={() => void confirmRemove()}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export type { CameraDraft };
