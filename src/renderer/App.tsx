import { useCallback, useEffect, useState } from "react";
import type { AppConfig } from "../shared/config.js";
import { SettingsView } from "./views/SettingsView.js";
import { CamerasView } from "./views/CamerasView.js";
import { FullscreenView } from "./views/FullscreenView.js";
import { LibraryView } from "./views/LibraryView.js";
import {
  LayoutSwitcher,
  MonitoringGrid,
  type GridLayout,
} from "./components/MonitoringGrid.js";
import { PtzPanel } from "./components/PtzPanel.js";
import { useAppStore, subscribeToCameraEvents } from "./store/appStore.js";
import type { CameraSummary } from "../shared/contracts.js";
import {
  CameraIcon,
  DashboardIcon,
  ImageIcon,
  RecIcon,
  SettingsIcon,
} from "./icons.js";

type Section =
  | "dashboard"
  | "cameras"
  | "recordings"
  | "snapshots"
  | "settings";

const NAV_ITEMS: Array<{
  id: Section;
  label: string;
  icon: React.JSX.Element;
}> = [
  { id: "dashboard", label: "Live", icon: <DashboardIcon /> },
  { id: "cameras", label: "Câmeras", icon: <CameraIcon /> },
  { id: "recordings", label: "Gravações", icon: <RecIcon /> },
  { id: "snapshots", label: "Snapshots", icon: <ImageIcon /> },
  { id: "settings", label: "Configurações", icon: <SettingsIcon /> },
];

const SECTION_DESCRIPTIONS: Record<Section, string> = {
  dashboard: "Monitoramento ao vivo das suas câmeras.",
  cameras: "Gerencie câmeras cadastradas, edite e teste conexões.",
  recordings: "Gravações locais por câmera, data e horário.",
  snapshots: "Snapshots capturados por câmera.",
  settings: "Tema, diretórios, reconexão e comportamento de streams.",
};

function sectionTitle(section: Section): string {
  const item = NAV_ITEMS.find((nav) => nav.id === section);
  return item?.label ?? "Live";
}

function DashboardView({
  layout,
  onPtzSelect,
  onEditCamera,
  selectedPtzCameraId,
}: {
  layout: GridLayout;
  onPtzSelect: (camera: CameraSummary) => void;
  onEditCamera: (camera: CameraSummary) => void;
  selectedPtzCameraId: string | null;
}): React.JSX.Element {
  const cameras = useAppStore((state) => state.cameras);
  const openFullscreen = useAppStore((state) => state.openFullscreen);

  return (
    <MonitoringGrid
      cameras={cameras}
      layout={layout}
      onOpenFullscreen={openFullscreen}
      onPtzSelect={onPtzSelect}
      onEdit={onEditCamera}
      selectedPtzCameraId={selectedPtzCameraId}
    />
  );
}

function SidebarPtz({
  camera,
}: {
  camera: CameraSummary | null;
}): React.JSX.Element {
  return (
    <section className="sidebar-ptz" aria-labelledby="sidebar-ptz-title">
      <p className="sidebar-ptz-title" id="sidebar-ptz-title">
        Controle PTZ
      </p>
      <PtzPanel
        cameraId={camera?.active && camera.supportsPtz ? camera.id : null}
        cameraName={camera?.name ?? null}
        supported={Boolean(camera?.active && camera.supportsPtz)}
        zoomSupported
        presetsSupported={false}
      />
    </section>
  );
}

export function App(): React.JSX.Element {
  const [section, setSection] = useState<Section>("dashboard");
  const [gridLayout, setGridLayout] = useState<GridLayout>(2);
  const [cameraToEditId, setCameraToEditId] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedPtzCameraId, setSelectedPtzCameraId] = useState<string | null>(
    null,
  );
  const cameras = useAppStore((state) => state.cameras);
  const fullscreenCamera = useAppStore((state) => state.fullscreenCamera);
  const selectedPtzCamera =
    cameras.find((camera) => camera.id === selectedPtzCameraId) ?? null;

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
          <SidebarPtz camera={selectedPtzCamera} />
          <p>v0.1.0 · Totalmente local</p>
        </div>
      </aside>

      <main
        className={`app-content${section === "dashboard" ? " app-content-live" : ""}`}
      >
        <header className="page-header">
          <div>
            <h1 className="page-title">{sectionTitle(section)}</h1>
            {SECTION_DESCRIPTIONS[section] && (
              <p className="page-description">
                {SECTION_DESCRIPTIONS[section]}
              </p>
            )}
          </div>
          {section === "dashboard" && (
            <LayoutSwitcher layout={gridLayout} onChange={setGridLayout} />
          )}
        </header>

        {section === "dashboard" && (
          <DashboardView
            layout={gridLayout}
            onPtzSelect={(camera) => setSelectedPtzCameraId(camera.id)}
            onEditCamera={(camera) => {
              setCameraToEditId(camera.id);
              setSection("cameras");
            }}
            selectedPtzCameraId={selectedPtzCameraId}
          />
        )}
        {section === "cameras" && (
          <CamerasView
            cameras={cameras}
            onRefresh={refreshCameras}
            editCameraId={cameraToEditId}
            onEditCameraConsumed={() => setCameraToEditId(null)}
          />
        )}
        {section === "recordings" && (
          <LibraryView cameras={cameras} mode="recordings" />
        )}
        {section === "snapshots" && (
          <LibraryView cameras={cameras} mode="snapshots" />
        )}
        {section === "settings" && <SettingsView initialConfig={config} />}
      </main>
    </div>
  );
}
