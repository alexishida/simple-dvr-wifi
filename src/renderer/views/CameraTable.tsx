import { useState } from "react";
import type { CameraMetrics, CameraSummary } from "../../shared/contracts.js";
import type { CameraDraft } from "./camera-types.js";
import {
  ActivityIcon,
  BlockIcon,
  BoltIcon,
  CameraIcon,
  CloseIcon,
  EditIcon,
  RecIcon,
  SettingsIcon,
  TrashIcon,
} from "../icons.js";
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
  onMetrics: (camera: CameraSummary) => void;
}

function CameraRow({
  camera,
  onEdit,
  onToggle,
  onRemove,
  onTest,
  onMetrics,
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
          {camera.hasOnvif && (
            <span className="meta-chip">
              <SettingsIcon size={14} />
              ONVIF
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
            className="btn-icon row-action-btn"
            aria-label={`Testar conexão de ${camera.name}`}
            title="Testar conexão"
            onClick={() => onTest(camera)}
          >
            <ActivityIcon size={16} />
          </button>
          <button type="button" className="btn-icon row-action-btn" aria-label={`Ver métricas de ${camera.name}`} title="Ver métricas" onClick={() => onMetrics(camera)}><SettingsIcon size={16} /></button>
          <button
            type="button"
            className="btn-icon row-action-btn"
            aria-label={`Editar ${camera.name}`}
            title="Editar"
            onClick={() => onEdit(camera)}
          >
            <EditIcon size={16} />
          </button>
          <button
            type="button"
            className="btn-icon row-action-btn"
            aria-label={`${active ? "Desativar" : "Ativar"} ${camera.name}`}
            title={active ? "Desativar" : "Ativar"}
            onClick={() => onToggle(camera)}
          >
            <BlockIcon size={16} />
          </button>
          <button
            type="button"
            className="btn-icon row-action-btn btn-danger"
            aria-label={`Remover ${camera.name}`}
            title="Remover"
            onClick={() => onRemove(camera)}
          >
            <TrashIcon size={16} />
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
  const [metrics, setMetrics] = useState<{ camera: CameraSummary; value: CameraMetrics } | null>(null);
  const [metricsMessage, setMetricsMessage] = useState<string | null>(null);

  const handleRemove = (camera: CameraSummary): void => {
    setSelected(camera);
  };

  const confirmRemove = async (): Promise<void> => {
    if (!selected) return;
    await window.api.cameras.remove(selected.id);
    setSelected(null);
    onRemove(selected);
  };

  const showMetrics = (camera: CameraSummary): void => {
    setMetricsMessage(null);
    void window.api.cameras.metrics(camera.id).then((result) => {
      if (result.ok) setMetrics({ camera, value: result.value });
      else setMetricsMessage(result.error.message);
    });
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
                onMetrics={showMetrics}
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
                <CloseIcon size={16} />
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-danger"
                onClick={() => void confirmRemove()}
              >
                <TrashIcon size={16} />
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
      {metrics && <div className="modal-backdrop" role="presentation"><div className="modal camera-metrics-modal" role="dialog" aria-modal="true" aria-labelledby="metrics-title"><h3 className="panel-title" id="metrics-title"><ActivityIcon size={20} /> Métricas: {metrics.camera.name}</h3><dl className="camera-metrics-list"><div><dt>Conexão</dt><dd>{cameraStatusLabel(metrics.value.connection)}</dd></div><div><dt>Fabricante e modelo</dt><dd>{[metrics.value.manufacturer, metrics.value.model].filter(Boolean).join(" · ") || "Indisponível"}</dd></div><div><dt>Sessão principal</dt><dd>{metrics.value.mainSession ?? "Indisponível"}</dd></div><div><dt>Firmware</dt><dd>{metrics.value.firmwareVersion ?? "Indisponível"}</dd></div><div><dt>Substream</dt><dd>{metrics.value.subSession ?? "Indisponível"}</dd></div><div><dt>Busca e replay ONVIF</dt><dd>{metrics.value.onvifRecordingSearch ? "Disponível" : "Indisponível"}</dd></div><div><dt>Quadros perdidos</dt><dd>{metrics.value.droppedFrames === null ? "Indisponível neste stream" : metrics.value.droppedFrames}</dd></div></dl><h4>Perfis detectados</h4>{metrics.value.profiles.length === 0 ? <p className="empty-state-text">Nenhum perfil ONVIF disponível. Execute o teste de conexão para atualizar os dados.</p> : <div className="camera-metrics-profiles">{metrics.value.profiles.map((profile) => <div key={profile.streamType}><strong>{profile.streamType === "main" ? "Principal" : "Substream"}</strong><span>{profile.name ?? "Sem nome"}</span><span>Codec: {profile.codec ?? "Indisponível"}</span><span>Resolução: {profile.width && profile.height ? `${profile.width} × ${profile.height}` : "Indisponível"}</span><span>Quadros: {profile.fps === null ? "Indisponível" : `${profile.fps} fps`}</span></div>)}</div>}<div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setMetrics(null)}><CloseIcon size={16} />Fechar</button></div></div></div>}
      {metricsMessage && <p className="form-message form-error" role="alert">{metricsMessage}</p>}
    </>
  );
}

export type { CameraDraft };
