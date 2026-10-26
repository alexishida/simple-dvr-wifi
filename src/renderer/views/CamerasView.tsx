import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import { CameraTable } from "./CameraTable.js";
import { CameraForm } from "./CameraForm.js";
import { CameraNotice } from "./CameraNotice.js";
import {
  CameraIcon,
  ChevronLeftIcon,
  CloseIcon,
  KeyIcon,
  PlusIcon,
  SearchIcon,
  WifiIcon,
} from "../icons.js";
import type { CameraDraft } from "./camera-types.js";
import { runCameraMutation } from "../store/appStore.js";

interface DiscoveryInterface {
  name: string;
  address: string;
  netmask: string;
}
interface DiscoveredOnvifDevice {
  identity?: { manufacturer: string | null; model: string | null } | null;
  endpointReference: string | null;
  host: string;
  onvifUrl: string;
  scopes: string[];
  types: string[];
}
interface AutoConfigurationTarget {
  host: string;
  onvifUrl: string | null;
  endpointReference: string | null;
}
type OnboardingMode = "choice" | "discovery" | "ip" | "detected";
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
  const [onboarding, setOnboarding] = useState<OnboardingMode | null>(null);
  const [interfaces, setInterfaces] = useState<DiscoveryInterface[]>([]);
  const [selectedInterface, setSelectedInterface] = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredOnvifDevice[]>([]);
  const [activeDiscovered, setActiveDiscovered] = useState<
    Array<{
      host: string;
      onvifUrl: string | null;
      endpointReference: null;
      services: string[];
      identity?: { manufacturer: string | null; model: string | null } | null;
    }>
  >([]);
  const [discoveryMode, setDiscoveryMode] = useState<"active" | "onvif">(
    "onvif",
  );
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);
  const [formOrigin, setFormOrigin] = useState<OnboardingMode>("choice");
  const [fallbackDraft, setFallbackDraft] = useState<CameraDraft | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const discoveryRequestId = useRef<string | null>(null);
  const [discoveryMessage, setDiscoveryMessage] = useState<{
    kind: "info" | "error";
    text: string;
  } | null>(null);
  const [draft, setDraft] = useState<CameraDraft | null>(null);
  const [autoTarget, setAutoTarget] = useState<AutoConfigurationTarget | null>(
    null,
  );
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const flowRevision = useRef(0);
  useEffect(
    () => () => {
      flowRevision.current++;
      if (discoveryRequestId.current)
        void window.api.cameras
          .cancelDiscovery(discoveryRequestId.current)
          .catch(() => undefined);
    },
    [],
  );
  const [configurationMessage, setConfigurationMessage] = useState<{
    kind: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const [testMessage, setTestMessage] = useState<{
    kind: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const hasPendingDraft = initialDraft !== undefined && initialDraft !== null;
  const activeDraft = draft ?? initialDraft ?? null;
  const showForm = editing !== null || creating || activeDraft !== null;
  const stopPending = (): void => {
    flowRevision.current++;
    setConfiguring(false);
    setDiscovering(false);
    setLoadingInterfaces(false);
    if (discoveryRequestId.current)
      void window.api.cameras
        .cancelDiscovery(discoveryRequestId.current)
        .catch(() => undefined);
    discoveryRequestId.current = null;
  };
  const closeOnboarding = (): void => {
    stopPending();
    setOnboarding(null);
    setDiscovered([]);
    setActiveDiscovered([]);
    setDiscoveryMessage(null);
    setConfigurationMessage(null);
    setAutoTarget(null);
    setPassword("");
    setUsername("");
    setHost("");
    setFallbackDraft(null);
    setDraft(null);
    setCreating(false);
  };
  const backFromAccess = (): void => {
    stopPending();
    setConfigurationMessage(null);
    setOnboarding(onboarding === "detected" ? "discovery" : "choice");
  };
  const openManual = (): void => {
    stopPending();
    setFormOrigin(onboarding ?? "choice");
    setDraft({
      ...fallbackDraft,
      name: fallbackDraft?.name ?? (host.trim() ? `Câmera ${host.trim()}` : ""),
      host: host.trim(),
      username: username.trim() || null,
      password: password || null,
      onvifUrl: fallbackDraft?.onvifUrl ?? autoTarget?.onvifUrl ?? null,
      epr: autoTarget?.endpointReference ?? null,
    });
    setCreating(true);
    setOnboarding(null);
  };
  const selectDevice = (device: AutoConfigurationTarget): void => {
    stopPending();
    setAutoTarget(device);
    setHost(device.host);
    setUsername("");
    setPassword("");
    setFallbackDraft(null);
    setConfigurationMessage(null);
    setOnboarding("detected");
  };
  const openDiscovery = (): void => {
    const revision = ++flowRevision.current;
    setOnboarding("discovery");
    setLoadingInterfaces(true);
    setDiscoveryMessage(null);
    setDiscovered([]);
    setActiveDiscovered([]);
    void window.api.cameras
      .discoveryInterfaces()
      .then((result) => {
        if (revision !== flowRevision.current) return;
        if (!result.ok) {
          setDiscoveryMessage({ kind: "error", text: result.error.message });
          return;
        }
        setInterfaces(result.value);
        setLoadingInterfaces(false);
        if (!selectedInterface && result.value.length === 1)
          setSelectedInterface(result.value[0]!.address);
        if (result.value.length > 0)
          runDiscovery(
            "onvif",
            selectedInterface ||
              (result.value.length === 1 ? result.value[0]!.address : ""),
          );
      })
      .catch(() => {
        if (revision === flowRevision.current)
          setDiscoveryMessage({
            kind: "error",
            text: "Não foi possível carregar as interfaces de rede. Volte e tente novamente.",
          });
      })
      .finally(() => {
        if (revision === flowRevision.current) setLoadingInterfaces(false);
      });
  };
  const runDiscovery = (
    mode = discoveryMode,
    address = selectedInterface,
  ): void => {
    if (discovering) return;
    const revision = ++flowRevision.current;
    const requestId = crypto.randomUUID();
    setDiscovering(true);
    discoveryRequestId.current = requestId;
    setDiscoveryMode(mode);
    setDiscovered([]);
    setActiveDiscovered([]);
    if (mode === "active" && !address) {
      setDiscovering(false);
      discoveryRequestId.current = null;
      setDiscoveryMessage({
        kind: "error",
        text: "Escolha uma interface para varrer a sub-rede.",
      });
      return;
    }
    setDiscoveryMessage({
      kind: "info",
      text:
        mode === "active"
          ? "Verificando portas RTSP e ONVIF na sub-rede. Esta busca pode levar alguns segundos…"
          : "Buscando câmeras ONVIF na rede…",
    });
    const request =
      mode === "active"
        ? window.api.cameras.discoverActive({ requestId, address })
        : window.api.cameras.discover({
            requestId,
            address: address || undefined,
          });
    void request
      .then((result) => {
        if (revision !== flowRevision.current) return;
        if (!result.ok) {
          setDiscoveryMessage({ kind: "error", text: result.error.message });
          return;
        }
        if (mode === "active") {
          setActiveDiscovered(
            result.value as Array<{
              host: string;
              onvifUrl: string | null;
              endpointReference: null;
              services: string[];
              identity?: {
                manufacturer: string | null;
                model: string | null;
              } | null;
            }>,
          );
        } else setDiscovered(result.value as DiscoveredOnvifDevice[]);
        setDiscoveryMessage({
          kind: "info",
          text: result.value.length
            ? `${result.value.length} câmera(s) ou serviço(s) encontrado(s). Selecione um para configurar.`
            : "Nenhum serviço de câmera foi reconhecido. Tente informar o IP ou use URL manual.",
        });
      })
      .catch(() => {
        if (revision === flowRevision.current)
          setDiscoveryMessage({
            kind: "error",
            text: "Não foi possível concluir a busca. Tente novamente.",
          });
      })
      .finally(() => {
        if (revision !== flowRevision.current) return;
        setDiscovering(false);
        discoveryRequestId.current = null;
      });
  };
  const configure = (): void => {
    if (configuring || !host.trim()) return;
    const revision = ++flowRevision.current;
    setConfiguring(true);
    setConfigurationMessage({
      kind: "info",
      text: "Identificando a câmera e validando o streaming…",
    });
    const request = window.api.cameras.autoConfigure({
      host: host.trim(),
      onvifUrl: autoTarget?.onvifUrl ?? fallbackDraft?.onvifUrl ?? null,
      username: username.trim() || null,
      password: password || null,
    });
    void request
      .then((result) => {
        if (revision !== flowRevision.current) return;
        if (!result.ok) {
          setConfigurationMessage({
            kind: "error",
            text: result.error.message,
          });
          return;
        }
        const details = result.value.segments
          .map((segment) => `${segment.name.toUpperCase()}: ${segment.detail}`)
          .join(" ");
        const identified = result.value.identified;
        const onvifUrl =
          "onvifUrl" in result.value &&
          typeof result.value.onvifUrl === "string"
            ? result.value.onvifUrl
            : (autoTarget?.onvifUrl ?? null);
        if (result.value.status === "connected" && identified?.rtspUrl) {
          setFormOrigin(onboarding ?? "ip");
          setDraft({
            name:
              fallbackDraft?.name ||
              (identified.model
                ? `${identified.manufacturer ?? "Câmera"} ${identified.model}`
                : `Câmera ${host}`),
            host: onvifUrl ? new URL(onvifUrl).hostname : host.trim(),
            onvifUrl,
            rtspUrl: identified.rtspUrl,
            username: username.trim() || null,
            password: password || null,
            manufacturer: identified.manufacturer,
            model: identified.model,
            serialNumber: identified.serialNumber,
            epr: autoTarget?.endpointReference ?? null,
          });
          setOnboarding(null);
          setConfigurationMessage({
            kind: "success",
            text: "Vídeo validado. Confira o nome e confirme o cadastro da câmera.",
          });
          return;
        }
        setFallbackDraft({
          host,
          name: `Câmera ${host}`,
          username: username.trim() || null,
          password: password || null,
          onvifUrl,
          manufacturer: identified?.manufacturer ?? null,
          model: identified?.model ?? null,
          serialNumber: identified?.serialNumber ?? null,
          epr: autoTarget?.endpointReference ?? null,
        });
        setConfigurationMessage({
          kind: "error",
          text: `${details} Confira o endereço e a conta local da câmera e tente novamente. Se necessário, use Inserir URL manual.`,
        });
      })
      .catch(() => {
        if (revision === flowRevision.current)
          setConfigurationMessage({
            kind: "error",
            text: "Não foi possível configurar a câmera. Tente novamente.",
          });
      })
      .finally(() => {
        if (revision === flowRevision.current) setConfiguring(false);
      });
  };
  const openCameraEditor = useCallback((cameraId: string): void => {
    void window.api.cameras.details(cameraId).then((result) => {
      if (!result.ok) {
        setTestMessage({ kind: "error", text: result.error.message });
        return;
      }
      setEditing({
        id: cameraId,
        name: result.value.name,
        draft: { ...result.value, password: null },
      });
    });
  }, []);
  useEffect(() => {
    if (editCameraId) {
      openCameraEditor(editCameraId);
      onEditCameraConsumed?.();
    }
  }, [editCameraId, onEditCameraConsumed, openCameraEditor]);
  const handleSaved = (): void => {
    closeOnboarding();
    setEditing(null);
    setCreating(false);
    setDraft(null);
    if (hasPendingDraft) onDraftConsumed?.();
    onRefresh();
  };
  const formDraft = editing?.draft ?? activeDraft ?? undefined;

  if (showForm)
    return (
      <div className="panel camera-editor-panel">
        <div className="camera-flow-header">
          <span className="camera-flow-eyebrow">
            {editing ? "Configuração da câmera" : "Adicionar câmera"}
          </span>
          <h2 className="panel-title">
            {editing ? `Editar ${editing.name}` : configurationMessage?.kind === "success" ? "Confirmar cadastro" : "Nova câmera"}
          </h2>
          <p className="field-hint">
            {configurationMessage?.kind === "success" && !editing
              ? "Escolha um nome para a câmera e confirme os dados abaixo."
              : "Confira os dados e teste a conexão antes de salvar."}
          </p>
        </div>
        {configurationMessage &&
          configurationMessage.kind !== "info" &&
          !editing && (
            <CameraNotice
              kind={configurationMessage.kind}
              text={configurationMessage.text}
            />
          )}
        <CameraForm
          key={editing?.id ?? "new-camera"}
          initial={formDraft}
          editingId={editing?.id ?? null}
          advancedInitially={creating || editing !== null}
          verifiedAutomatically={
            configurationMessage?.kind === "success" && !editing
          }
          onSaved={handleSaved}
          onBack={
            !editing && !hasPendingDraft
              ? (current) => {
                  stopPending();
                  setDraft(null);
                  setCreating(false);
                  setFallbackDraft(current);
                  setHost(current.host);
                  setUsername(current.username ?? "");
                  setPassword(current.password ?? "");
                  setConfigurationMessage(null);
                  setOnboarding(formOrigin);
                }
              : undefined
          }
          onCancel={() => {
            closeOnboarding();
            setOnboarding(null);
            setConfigurationMessage(null);
            setEditing(null);
            setCreating(false);
            setDraft(null);
            if (hasPendingDraft) onDraftConsumed?.();
          }}
        />
      </div>
    );
  if (onboarding === "choice")
    return (
      <section
        className="panel camera-onboarding"
        aria-labelledby="camera-onboarding-title"
      >
        <div className="section-heading">
          <div>
            <span className="camera-flow-eyebrow">
              Adicionar câmera · Escolha o método
            </span>
            <h2 id="camera-onboarding-title" className="panel-title">
              Como deseja adicionar a câmera?
            </h2>
            <p className="field-hint">
              O app tenta configurar o streaming automaticamente nos dois
              primeiros métodos.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={closeOnboarding}
          >
            <CloseIcon size={16} /> Fechar
          </button>
        </div>
        <div className="camera-onboarding-options">
          <button
            type="button"
            className="camera-onboarding-option"
            onClick={openDiscovery}
          >
            <SearchIcon size={24} />
            <span>
              <strong>Detectar automaticamente</strong>
              <small>
                Encontre câmeras e serviços disponíveis na sua rede.
              </small>
            </span>
          </button>
          <button
            type="button"
            className="camera-onboarding-option"
            onClick={() => {
              setHost("");
              setUsername("");
              setPassword("");
              setAutoTarget(null);
              setFallbackDraft(null);
              setConfigurationMessage(null);
              setOnboarding("ip");
            }}
          >
            <WifiIcon size={24} />
            <span>
              <strong>Configurar por IP</strong>
              <small>Informe o IP e as credenciais da câmera.</small>
            </span>
          </button>
          <button
            type="button"
            className="camera-onboarding-option"
            onClick={() => {
              setFormOrigin("choice");
              setDraft(formOrigin === "choice" ? fallbackDraft : null);
              setConfigurationMessage(null);
              setCreating(true);
              setOnboarding(null);
            }}
          >
            <PlusIcon size={24} />
            <span>
              <strong>Adicionar URL manualmente</strong>
              <small>Use URLs RTSP ou ONVIF já conhecidas.</small>
            </span>
          </button>
        </div>
      </section>
    );
  if (onboarding === "discovery")
    return (
      <section
        className="panel camera-discovery-panel"
        aria-labelledby="discovery-title"
      >
        <div className="section-heading">
          <div>
            <span className="camera-flow-eyebrow">
              Adicionar câmera · Descoberta
            </span>
            <h2 id="discovery-title" className="panel-title">
              Detectar câmeras na rede
            </h2>
            <p className="field-hint">
              A busca rápida procura câmeras ONVIF. Se sua câmera não aparecer,
              tente a varredura da sub-rede ou informe o IP.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              stopPending();
              setDiscoveryMessage(null);
              setOnboarding("choice");
            }}
          >
            <ChevronLeftIcon size={16} /> Voltar
          </button>
        </div>
        <div className="camera-discovery-controls">
          <div className="field">
            <label className="field-label" htmlFor="discovery-mode">
              Método
            </label>
            <select
              id="discovery-mode"
              className="field-input"
              value={discoveryMode}
              onChange={(event) => {
                setDiscoveryMode(event.target.value as "active" | "onvif");
                setDiscovered([]);
                setActiveDiscovered([]);
                setDiscoveryMessage(null);
              }}
              disabled={discovering || loadingInterfaces}
            >
              <option value="active">Varredura da sub-rede</option>
              <option value="onvif">Busca rápida ONVIF</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="discovery-interface">
              Interface de rede
            </label>
            <select
              id="discovery-interface"
              className="field-input"
              value={selectedInterface}
              onChange={(event) => {
                setSelectedInterface(event.target.value);
                setDiscovered([]);
                setActiveDiscovered([]);
                setDiscoveryMessage(null);
              }}
              disabled={discovering || loadingInterfaces}
            >
              <option value="">
                {discoveryMode === "active"
                  ? "Selecione uma interface"
                  : "Todas as interfaces disponíveis"}
              </option>
              {interfaces.map((network) => (
                <option key={network.address} value={network.address}>
                  {network.name} ({network.address})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => runDiscovery()}
            disabled={
              discovering ||
              loadingInterfaces ||
              interfaces.length === 0 ||
              (discoveryMode === "active" && !selectedInterface)
            }
          >
            <SearchIcon size={16} />{" "}
            {discovering ? "Buscando…" : "Buscar câmeras"}
          </button>
        </div>
        {loadingInterfaces && (
          <CameraNotice
            kind="info"
            busy
            title="Preparando busca"
            text="Carregando interfaces de rede…"
          />
        )}
        {interfaces.length === 0 && !loadingInterfaces && !discoveryMessage && (
          <CameraNotice
            kind="error"
            title="Rede indisponível"
            text="Nenhuma interface IPv4 de rede está disponível para a descoberta."
          />
        )}
        {discoveryMessage && (
          <CameraNotice
            kind={discoveryMessage.kind}
            busy={discovering}
            title={
              discovering
                ? "Buscando câmeras na rede"
                : discoveryMessage.kind === "error"
                  ? "Não foi possível buscar câmeras"
                  : "Busca concluída"
            }
            text={discoveryMessage.text}
          />
        )}
        <div className="camera-actions camera-discovery-alternatives">
          {discovering && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                stopPending();
                setDiscoveryMessage({
                  kind: "info",
                  text: "Busca cancelada. Você pode iniciar uma nova busca.",
                });
              }}
            >
              <CloseIcon size={16} /> Cancelar busca
            </button>
          )}
          {!discovering && discoveryMode === "onvif" && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setDiscoveryMode("active");
                setDiscovered([]);
                setDiscoveryMessage(null);
                if (selectedInterface) runDiscovery("active");
              }}
            >
              <SearchIcon size={16} /> Buscar por portas
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              stopPending();
              setAutoTarget(null);
              setHost("");
              setUsername("");
              setPassword("");
              setFallbackDraft(null);
              setConfigurationMessage(null);
              setOnboarding("ip");
            }}
          >
            <WifiIcon size={16} /> Configurar por IP
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              stopPending();
              setFormOrigin("discovery");
              setDraft(null);
              setCreating(true);
              setConfigurationMessage(null);
              setOnboarding(null);
            }}
          >
            <PlusIcon size={16} /> Inserir URL manual
          </button>
        </div>
        {discovered.length > 0 && (
          <div
            className="camera-discovery-results"
            aria-label="Câmeras encontradas"
          >
            {discovered.map((device) => (
              <button
                key={`${device.endpointReference ?? ""}|${device.onvifUrl}`}
                type="button"
                className="camera-discovery-result"
                onClick={() => selectDevice(device)}
              >
                <CameraIcon size={20} />
                <span>
                  <strong>
                    {[device.identity?.manufacturer, device.identity?.model]
                      .filter(Boolean)
                      .join(" ") || device.host}
                  </strong>
                  <small>
                    {device.host} · ONVIF
                    {!device.identity?.model
                      ? " · Informe as credenciais para concluir a identificação"
                      : ""}
                  </small>
                </span>
                <span className="camera-discovery-select">Configurar</span>
              </button>
            ))}
          </div>
        )}
        {activeDiscovered.length > 0 && (
          <div
            className="camera-discovery-results"
            aria-label="Serviços de câmera encontrados"
          >
            {activeDiscovered.map((device) => (
              <button
                key={device.host}
                type="button"
                className="camera-discovery-result"
                onClick={() => selectDevice(device)}
              >
                <CameraIcon size={20} />
                <span>
                  <strong>
                    {[device.identity?.manufacturer, device.identity?.model]
                      .filter(Boolean)
                      .join(" ") || device.host}
                  </strong>
                  <small>
                    {device.host} ·{" "}
                    {device.services
                      .map((service) => service.toUpperCase())
                      .join(" · ")}
                    {!device.identity?.model
                      ? " · Informe as credenciais para concluir a identificação"
                      : ""}
                  </small>
                </span>
                <span className="camera-discovery-select">Configurar</span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  if (onboarding === "ip" || onboarding === "detected")
    return (
      <section
        className="panel camera-onboarding camera-configure-panel"
        aria-labelledby="configure-camera-title"
      >
        <div className="section-heading">
          <div>
            <span className="camera-flow-eyebrow">
              Adicionar câmera · Dados de acesso
            </span>
            <h2 id="configure-camera-title" className="panel-title">
              {onboarding === "ip"
                ? "Configurar câmera por IP"
                : "Configurar câmera detectada"}
            </h2>
            <p className="field-hint">
              O app identifica o fabricante e valida o streaming antes de
              liberar o cadastro.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={backFromAccess}
          >
            <ChevronLeftIcon size={16} /> Voltar
          </button>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="camera-host">
            Endereço (IP ou hostname)
          </label>
          <input
            id="camera-host"
            className="field-input"
            disabled={configuring}
            value={host}
            onChange={(event) => {
              setHost(event.target.value);
              setFallbackDraft(null);
              setConfigurationMessage(null);
            }}
            readOnly={onboarding === "detected"}
            required
          />
        </div>
        <div className="field-row camera-form-credentials">
          <div className="field">
            <label className="field-label" htmlFor="camera-user">
              Usuário
            </label>
            <input
              id="camera-user"
              className="field-input"
              disabled={configuring}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="camera-password">
              Senha da câmera
            </label>
            <input
              id="camera-password"
              className="field-input"
              disabled={configuring}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>
        {configurationMessage && (
          <CameraNotice
            kind={configurationMessage.kind}
            text={configurationMessage.text}
            busy={configuring}
          />
        )}
        <div className="modal-actions camera-form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={openManual}
          >
            <PlusIcon size={16} /> Inserir URL manual
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={configure}
            disabled={configuring || !host.trim()}
          >
            <KeyIcon size={16} />{" "}
            {configuring ? "Configurando…" : "Configurar automaticamente"}
          </button>
        </div>
      </section>
    );
  return (
    <>
      <div className="section-heading camera-list-heading">
        <h2 className="section-title">Câmeras cadastradas</h2>
        <div className="camera-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setOnboarding("choice")}
          >
            <PlusIcon size={16} /> Adicionar câmera
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
            Detecte uma câmera na rede, configure-a por IP ou informe uma URL
            manual.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setOnboarding("choice")}
          >
            <PlusIcon size={16} /> Adicionar câmera
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
            onEdit={(camera) => openCameraEditor(camera.id)}
            onToggle={async (camera) => {
              await runCameraMutation({
                kind: camera.active ? "deactivate" : "reactivate",
                id: camera.id,
              });
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
                setTestMessage({
                  kind:
                    result.value.status === "connected" ? "success" : "error",
                  text: result.value.segments
                    .map(
                      (segment) =>
                        `${segment.name.toUpperCase()}: ${segment.detail}`,
                    )
                    .join(" "),
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
