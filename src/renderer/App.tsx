import { useCallback, useEffect, useState } from "react";
import type { AppConfig } from "../shared/config.js";
import { SettingsView } from "./views/SettingsView.js";
import { DiagnosticsView } from "./views/DiagnosticsView.js";
import { CamerasView } from "./views/CamerasView.js";
import { DiscoveryView } from "./views/DiscoveryView.js";
import { FullscreenView } from "./views/FullscreenView.js";
import { LibraryView } from "./views/LibraryView.js";
import { MonitoringGrid } from "./components/MonitoringGrid.js";
import { useAppStore, subscribeToCameraEvents } from "./store/appStore.js";
import type { CameraDraft } from "./views/camera-types.js";
import { discoveryCameraToDraft } from "./discovery-draft.js";
import {
  ActivityIcon,
  CameraIcon,
  DashboardIcon,
  ImageIcon,
  RecIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons.js";

type Section =
  | "dashboard"
  | "cameras"
  | "discovery"
  | "recordings"
  | "snapshots"
  | "diagnostics"
  | "settings";

const NAV_ITEMS: Array<{
  id: Section;
  label: string;
  icon: React.JSX.Element;
}> = [
  { id: "dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { id: "cameras", label: "Câmeras", icon: <CameraIcon /> },
  { id: "discovery", label: "Descoberta", icon: <SearchIcon /> },
  { id: "recordings", label: "Gravações", icon: <RecIcon /> },
  { id: "snapshots", label: "Snapshots", icon: <ImageIcon /> },
  { id: "diagnostics", label: "Diagnóstico", icon: <ActivityIcon /> },
  { id: "settings", label: "Configurações", icon: <SettingsIcon /> },
];

const SECTION_DESCRIPTIONS: Record<Section, string> = {
  dashboard: "Visão geral do seu parque de câmeras.",
  cameras: "Gerencie câmeras cadastradas, edite e teste conexões.",
  discovery: "Encontre câmeras ONVIF na sua rede local.",
  recordings: "Gravações locais por câmera, data e horário.",
  snapshots: "Snapshots capturados por câmera.",
  diagnostics: "Diagnóstico de conexão e logs sanitizados.",
  settings: "Tema, diretórios, reconexão e comportamento de streams.",
};

function sectionTitle(section: Section): string {
  const item = NAV_ITEMS.find((nav) => nav.id === section);
  return item?.label ?? "Dashboard";
}

function EmptyPanel({
  icon,
  title,
  text,
}: {
  icon: React.JSX.Element;
  title: string;
  text: string;
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-text">{text}</p>
    </div>
  );
}

function DashboardView(): React.JSX.Element {
  const cameras = useAppStore((state) => state.cameras);
  const openFullscreen = useAppStore((state) => state.openFullscreen);

  const connected = cameras.filter((c) => c.status === "connected").length;
  const recording = cameras.filter(
    (c) => c.recordingStatus === "recording",
  ).length;
  const withError = cameras.filter(
    (c) => c.status.includes("error") || c.status === "unavailable",
  ).length;

  return (
    <>
      <section aria-label="Resumo" className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total de câmeras</span>
          <span className="stat-value">{cameras.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Conectadas</span>
          <span className="stat-value success">{connected}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Gravando</span>
          <span className="stat-value warning">{recording}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Com erro</span>
          <span className="stat-value danger">{withError}</span>
        </div>
      </section>

      <MonitoringGrid cameras={cameras} onOpenFullscreen={openFullscreen} />
    </>
  );
}

function ComingSoon({ section }: { section: Section }): React.JSX.Element {
  const icon = NAV_ITEMS.find((nav) => nav.id === section)?.icon ?? (
    <SettingsIcon />
  );
  return (
    <EmptyPanel
      icon={icon}
      title={`${sectionTitle(section)} em breve`}
      text={SECTION_DESCRIPTIONS[section]}
    />
  );
}

export function App(): React.JSX.Element {
  const [section, setSection] = useState<Section>("dashboard");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [discoveryDraft, setDiscoveryDraft] = useState<CameraDraft | null>(
    null,
  );
  const cameras = useAppStore((state) => state.cameras);
  const fullscreenCamera = useAppStore((state) => state.fullscreenCamera);

  const refreshCameras = useCallback(() => {
    void window.api.cameras.list().then((result) => {
      if (result.ok) useAppStore.getState().setCameras(result.value);
    });
  }, []);

  useEffect(() => {
    refreshCameras();
    const unsubscribe = subscribeToCameraEvents();
    return unsubscribe;
  }, [refreshCameras]);

  useEffect(() => {
    void window.api.config.get().then((result) => {
      if (result.ok) setConfig(result.value);
    });
  }, []);

  if (fullscreenCamera) {
    return <FullscreenView camera={fullscreenCamera} />;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon" aria-hidden="true">
            <CameraIcon size={20} />
          </span>
          <div>
            <p className="sidebar-brand-name">Simple DVR Wi-Fi</p>
            <p className="sidebar-brand-sub">Monitoramento local</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <p className="nav-label">Monitoramento</p>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav-item"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p>v0.1.0 · Totalmente local</p>
        </div>
      </aside>

      <main className="app-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">{sectionTitle(section)}</h1>
            <p className="page-description">{SECTION_DESCRIPTIONS[section]}</p>
          </div>
        </header>

        {section === "dashboard" && <DashboardView />}
        {section === "cameras" && (
          <CamerasView
            cameras={cameras}
            onRefresh={refreshCameras}
            onNavigateToDiscovery={() => setSection("discovery")}
            initialDraft={discoveryDraft}
            onDraftConsumed={() => setDiscoveryDraft(null)}
          />
        )}
        {section === "discovery" && (
          <DiscoveryView
            onAddCamera={(camera) => {
              setDiscoveryDraft(discoveryCameraToDraft(camera));
              setSection("cameras");
            }}
          />
        )}
        {section === "recordings" && (
          <LibraryView cameras={cameras} mode="recordings" />
        )}
        {section === "snapshots" && (
          <LibraryView cameras={cameras} mode="snapshots" />
        )}
        {section === "settings" && <SettingsView initialConfig={config} />}
        {section === "diagnostics" && <DiagnosticsView cameras={cameras} />}
        {section !== "dashboard" &&
          section !== "cameras" &&
          section !== "discovery" &&
          section !== "recordings" &&
          section !== "snapshots" &&
          section !== "settings" &&
          section !== "diagnostics" && <ComingSoon section={section} />}
      </main>
    </div>
  );
}
