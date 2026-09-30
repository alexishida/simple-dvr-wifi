import { useCallback, useEffect, useState } from "react";
import type { AppConfig } from "../shared/config.js";
import { SettingsView } from "./views/SettingsView.js";
import { CamerasView } from "./views/CamerasView.js";
import { FullscreenView } from "./views/FullscreenView.js";
import { LibraryView } from "./views/LibraryView.js";
import { RecordingsView } from "./views/RecordingsView.js";
import {
  LayoutSwitcher,
  MonitoringGrid,
  type GridLayout,
} from "./components/MonitoringGrid.js";
import { PtzPanel } from "./components/PtzPanel.js";
import { DashboardLayouts } from "./components/DashboardLayouts.js";
import type { DashboardGroup, DashboardLayout } from "../shared/dashboard-layout.js";
import { useAppStore, subscribeToCameraEvents } from "./store/appStore.js";
import type { CameraSummary } from "../shared/contracts.js";
import {
  CameraIcon,
  DashboardIcon,
  ImageIcon,
  RecIcon,
  SettingsIcon,
} from "./icons.js";
import wordmarkUrl from "../../docs/logo/simple-dvr-wifi-wordmark.svg";
import logoUrl from "../../docs/logo/simple-dvr-wifi-logo.svg";

type Section =
  "dashboard" | "cameras" | "recordings" | "snapshots" | "settings";

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
  recordings: "Consulte a biblioteca local e as gravações no cartão SD.",
  snapshots: "Snapshots capturados por câmera.",
  settings: "Ajuste as preferências do aplicativo, organizadas por categoria.",
};

function sectionTitle(section: Section): string {
  const item = NAV_ITEMS.find((nav) => nav.id === section);
  return item?.label ?? "Live";
}

function DashboardView({
  cameras,
  layout,
  onPtzSelect,
  onEditCamera,
  selectedPtzCameraId,
  savedLayout,
  onSlotsChanged,
}: {
  cameras: CameraSummary[];
  layout: GridLayout;
  onPtzSelect: (camera: CameraSummary) => void;
  onEditCamera: (camera: CameraSummary) => void;
  selectedPtzCameraId: string | null;
  savedLayout: DashboardLayout | null;
  onSlotsChanged: (slots: Array<string | null>) => void;
}): React.JSX.Element {
  const openFullscreen = useAppStore((state) => state.openFullscreen);

  return (
    <MonitoringGrid
      cameras={cameras}
      layout={layout}
      onOpenFullscreen={openFullscreen}
      onPtzSelect={onPtzSelect}
      onEdit={onEditCamera}
      selectedPtzCameraId={selectedPtzCameraId}
      savedLayout={savedLayout}
      onSlotsChanged={onSlotsChanged}
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
        presetsSupported={Boolean(camera?.active && camera.supportsPtz)}
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
  const activeLayout = config?.dashboard.layouts.find((layout) => layout.id === config.dashboard.selectedLayoutId) ?? null;
  const dashboardCameras = activeLayout?.groupId
    ? cameras.filter((camera) => config?.dashboard.groups.find((group) => group.id === activeLayout.groupId)?.cameraIds.includes(camera.id))
    : cameras;
  const saveLayout = (layout: DashboardLayout): void => {
    void window.api.dashboard.saveLayout(layout).then((result) => {
      if (!result.ok || !result.value.saved) return;
      setConfig((current) => current ? { ...current, dashboard: { ...current.dashboard, layouts: [...current.dashboard.layouts.filter((item) => item.id !== layout.id), layout], selectedLayoutId: layout.id } } : current);
    });
  };
  const saveGroup = (group: DashboardGroup): void => {
    void window.api.dashboard.saveGroup(group).then((result) => {
      if (result.ok && result.value.saved) setConfig((current) => current ? { ...current, dashboard: { ...current.dashboard, groups: [...current.dashboard.groups.filter((item) => item.id !== group.id), group] } } : current);
    });
  };
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

  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (favicon) favicon.href = logoUrl;
  }, []);

  if (fullscreenCamera) {
    return <FullscreenView camera={fullscreenCamera} />;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img
            className="sidebar-brand-wordmark"
            src={wordmarkUrl}
            alt="Simple DVR Wi-Fi"
          />
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
          <>
            {config && <DashboardLayouts cameras={cameras} groups={config.dashboard.groups} layouts={config.dashboard.layouts} activeLayout={activeLayout} gridLayout={gridLayout} onSelect={(layout) => setConfig({ ...config, dashboard: { ...config.dashboard, selectedLayoutId: layout?.id ?? null } })} onSaveGroup={saveGroup} onDeleteGroup={(id) => void window.api.dashboard.deleteGroup(id).then((result) => result.ok && result.value.deleted && setConfig((current) => current ? { ...current, dashboard: { ...current.dashboard, groups: current.dashboard.groups.filter((group) => group.id !== id), layouts: current.dashboard.layouts.map((layout) => layout.groupId === id ? { ...layout, groupId: null } : layout) } } : current))} onSaveLayout={saveLayout} onDeleteLayout={(id) => void window.api.dashboard.deleteLayout(id).then((result) => result.ok && result.value.deleted && setConfig((current) => current ? { ...current, dashboard: { ...current.dashboard, layouts: current.dashboard.layouts.filter((layout) => layout.id !== id), selectedLayoutId: current.dashboard.selectedLayoutId === id ? null : current.dashboard.selectedLayoutId } } : current))} />}
            <DashboardView cameras={dashboardCameras} layout={gridLayout} onPtzSelect={(camera) => setSelectedPtzCameraId(camera.id)} onEditCamera={(camera) => { setCameraToEditId(camera.id); setSection("cameras"); }} selectedPtzCameraId={selectedPtzCameraId} savedLayout={activeLayout} onSlotsChanged={(slots) => activeLayout && saveLayout({ ...activeLayout, columns: gridLayout, slots })} />
          </>
        )}
        {section === "cameras" && (
          <CamerasView
            cameras={cameras}
            onRefresh={refreshCameras}
            editCameraId={cameraToEditId}
            onEditCameraConsumed={() => setCameraToEditId(null)}
          />
        )}
        {section === "recordings" && <RecordingsView cameras={cameras} />}
        {section === "snapshots" && (
          <LibraryView cameras={cameras} mode="snapshots" />
        )}
        {section === "settings" && (
          <SettingsView initialConfig={config} onSaved={setConfig} />
        )}
      </main>
    </div>
  );
}
