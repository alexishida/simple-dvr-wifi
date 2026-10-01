import { useCallback, useEffect, useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import { CameraTable } from "./CameraTable.js";
import { CameraForm } from "./CameraForm.js";
import { CameraIcon, CloseIcon, PlusIcon, SearchIcon } from "../icons.js";
import type { CameraDraft } from "./camera-types.js";
import { runCameraMutation } from "../store/appStore.js";

interface DiscoveryInterface { name: string; address: string; }
interface DiscoveredOnvifDevice { endpointReference: string | null; host: string; onvifUrl: string; scopes: string[]; types: string[]; }

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
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [interfaces, setInterfaces] = useState<DiscoveryInterface[]>([]);
  const [selectedInterface, setSelectedInterface] = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredOnvifDevice[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryRequestId, setDiscoveryRequestId] = useState<string | null>(null);
  const [discoveryMessage, setDiscoveryMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [discoveredDraft, setDiscoveredDraft] = useState<CameraDraft | null>(null);
  const [testMessage, setTestMessage] = useState<{
    kind: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const hasPendingDraft = initialDraft !== undefined && initialDraft !== null;
  const activeDraft = discoveredDraft ?? initialDraft ?? null;
  const showForm = editing !== null || creating || activeDraft !== null;

  const openDiscovery = (): void => {
    setDiscoveryOpen(true); setDiscoveryMessage(null); setDiscovered([]);
    void window.api.cameras.discoveryInterfaces().then((result) => {
      if (!result.ok) { setDiscoveryMessage({ kind: "error", text: result.error.message }); return; }
      setInterfaces(result.value);
      if (!selectedInterface && result.value.length === 1) setSelectedInterface(result.value[0]!.address);
    });
  };
  const runDiscovery = (): void => {
    if (discovering) return;
    const requestId = crypto.randomUUID();
    setDiscovering(true); setDiscoveryRequestId(requestId); setDiscovered([]);
    setDiscoveryMessage({ kind: "info", text: "Buscando câmeras ONVIF na rede…" });
    void window.api.cameras.discover({ requestId, address: selectedInterface || undefined }).then((result) => {
      if (!result.ok) { setDiscoveryMessage({ kind: "error", text: result.error.message }); return; }
      setDiscovered(result.value);
      setDiscoveryMessage({ kind: "info", text: result.value.length ? `${result.value.length} câmera(s) encontrada(s). Selecione uma para continuar o cadastro.` : "Nenhuma câmera ONVIF respondeu. Verifique a rede, VLAN e firewall ou cadastre manualmente." });
    }).finally(() => { setDiscovering(false); setDiscoveryRequestId(null); });
  };
  const cancelDiscovery = (): void => { if (discoveryRequestId) void window.api.cameras.cancelDiscovery(discoveryRequestId); };

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
    setDiscoveredDraft(null);
    if (hasPendingDraft) onDraftConsumed?.();
    onRefresh();
  };

  if (discoveryOpen) return <section className="panel camera-discovery-panel" aria-labelledby="discovery-title">
    <div className="section-heading"><div><h2 id="discovery-title" className="panel-title">Descobrir câmeras na rede</h2><p className="field-hint">A busca usa ONVIF na rede local. Dispositivos em outra VLAN, VPN ou com multicast bloqueado podem não aparecer.</p></div>
      <button type="button" className="btn btn-secondary" onClick={() => { cancelDiscovery(); setDiscoveryOpen(false); }}><CloseIcon size={16} /> {discovering ? "Cancelar busca" : "Fechar"}</button></div>
    <div className="camera-discovery-controls"><div className="field"><label className="field-label" htmlFor="discovery-interface">Interface de rede</label><select id="discovery-interface" className="field-input" value={selectedInterface} onChange={(event) => setSelectedInterface(event.target.value)} disabled={discovering}><option value="">Todas as interfaces disponíveis</option>{interfaces.map((network) => <option key={network.address} value={network.address}>{network.name} ({network.address})</option>)}</select></div>
      <button type="button" className="btn btn-primary" onClick={runDiscovery} disabled={discovering || interfaces.length === 0}><SearchIcon size={16} /> {discovering ? "Buscando…" : "Buscar câmeras"}</button></div>
    {interfaces.length === 0 && !discoveryMessage && <p className="form-message form-error" role="status">Nenhuma interface IPv4 de rede está disponível para a descoberta.</p>}
    {discoveryMessage && <p className={`form-message form-${discoveryMessage.kind}`} role="status">{discoveryMessage.text}</p>}
    {discovered.length > 0 && <div className="camera-discovery-results" aria-label="Câmeras encontradas">{discovered.map((device) => {
      const registered = cameras.some((camera) => camera.host === device.host);
      return <button key={`${device.endpointReference ?? ""}|${device.onvifUrl}`} type="button" className="camera-discovery-result" onClick={() => { setDiscoveredDraft({ name: `Câmera ${device.host}`, host: device.host, onvifUrl: device.onvifUrl, epr: device.endpointReference }); setDiscoveryOpen(false); setCreating(false); }}><CameraIcon size={20} /><span><strong>{device.host}</strong><small>{device.onvifUrl}</small></span><span className="camera-discovery-select">{registered ? "Já cadastrada" : "Selecionar"}</span></button>;
    })}</div>}
  </section>;

  if (showForm) {
    const formDraft: CameraDraft | undefined =
      editing !== null
        ? editing.draft
        : activeDraft !== null
          ? (activeDraft as CameraDraft)
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
            setDiscoveredDraft(null);
            if (hasPendingDraft) onDraftConsumed?.();
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
          <button type="button" className="btn btn-secondary" onClick={openDiscovery}><SearchIcon size={16} /> Descobrir na rede</button>
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
            Procure uma câmera ONVIF na rede ou cadastre-a manualmente.
          </p>
          <button type="button" className="btn btn-secondary" onClick={openDiscovery}><SearchIcon size={16} /> Buscar câmeras</button>
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
