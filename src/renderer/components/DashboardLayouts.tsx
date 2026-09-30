import { useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import type { DashboardGroup, DashboardLayout } from "../../shared/dashboard-layout.js";
import { CheckIcon, DashboardIcon, PlusIcon, TrashIcon } from "../icons.js";
import type { GridLayout } from "./MonitoringGrid.js";

interface DashboardLayoutsProps {
  cameras: CameraSummary[];
  groups: DashboardGroup[];
  layouts: DashboardLayout[];
  activeLayout: DashboardLayout | null;
  gridLayout: GridLayout;
  onSelect: (layout: DashboardLayout | null) => void;
  onSaveGroup: (group: DashboardGroup) => void;
  onDeleteGroup: (id: string) => void;
  onSaveLayout: (layout: DashboardLayout) => void;
  onDeleteLayout: (id: string) => void;
}

export function DashboardLayouts(props: DashboardLayoutsProps): React.JSX.Element {
  const [groupName, setGroupName] = useState("");
  const [groupCameraIds, setGroupCameraIds] = useState<string[]>([]);
  const [layoutName, setLayoutName] = useState("");
  const [layoutGroupId, setLayoutGroupId] = useState<string | null>(null);
  const addGroup = (): void => {
    const name = groupName.trim();
    if (!name) return;
    props.onSaveGroup({ id: crypto.randomUUID(), name, cameraIds: groupCameraIds });
    setGroupName(""); setGroupCameraIds([]);
  };
  const addLayout = (): void => {
    const name = layoutName.trim();
    if (!name) return;
    props.onSaveLayout({ id: crypto.randomUUID(), name, columns: props.gridLayout, slots: [], groupId: layoutGroupId });
    setLayoutName("");
  };
  const activeLayout = props.activeLayout;
  return <section className="dashboard-layouts" aria-label="Grupos e layouts salvos">
    <div className="dashboard-layouts-row">
      <label className="dashboard-layouts-select"><DashboardIcon size={15} /><span>Layout</span>
        <select value={props.activeLayout?.id ?? ""} onChange={(event) => {
          const layout = props.layouts.find((item) => item.id === event.target.value) ?? null;
          props.onSelect(layout);
          if (layout) props.onSaveLayout(layout);
        }}>
          <option value="">Grade temporária</option>
          {props.layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
        </select>
      </label>
      {activeLayout && <button type="button" className="btn btn-sm" onClick={() => props.onSaveLayout({ ...activeLayout, columns: props.gridLayout })}><CheckIcon size={14} />Atualizar layout</button>}
      {activeLayout && <button type="button" className="btn btn-sm btn-danger" onClick={() => props.onDeleteLayout(activeLayout.id)}><TrashIcon size={14} />Excluir</button>}
      <label className="dashboard-layouts-select"><span>Grupo</span><select value={activeLayout?.groupId ?? layoutGroupId ?? ""} onChange={(event) => {
        const groupId = event.target.value || null;
        setLayoutGroupId(groupId);
        if (activeLayout) props.onSaveLayout({ ...activeLayout, groupId });
      }}><option value="">Todas as câmeras</option>{props.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    </div>
    <details className="dashboard-layouts-details">
      <summary>Gerenciar grupos e layouts</summary>
      <div className="dashboard-layouts-manager">
        <div><label htmlFor="layout-name">Novo layout</label><div className="dashboard-layouts-form"><input id="layout-name" value={layoutName} maxLength={80} onChange={(event) => setLayoutName(event.target.value)} placeholder="Ex.: Entrada" /><button type="button" className="btn btn-sm" onClick={addLayout}><PlusIcon size={14} />Salvar layout</button></div></div>
        <div><label htmlFor="group-name">Novo grupo</label><div className="dashboard-layouts-form"><input id="group-name" value={groupName} maxLength={80} onChange={(event) => setGroupName(event.target.value)} placeholder="Ex.: Piso térreo" /><button type="button" className="btn btn-sm" onClick={addGroup}><PlusIcon size={14} />Salvar grupo</button></div>
          <div className="dashboard-camera-checks">{props.cameras.map((camera) => <label key={camera.id}><input type="checkbox" checked={groupCameraIds.includes(camera.id)} onChange={() => setGroupCameraIds((ids) => ids.includes(camera.id) ? ids.filter((id) => id !== camera.id) : [...ids, camera.id])} />{camera.name}{!camera.active && " (desativada)"}</label>)}</div>
        </div>
        {props.groups.length > 0 && <div className="dashboard-group-list">{props.groups.map((group) => <div key={group.id}><span>{group.name} · {group.cameraIds.length} câmera(s)</span><button type="button" className="btn-icon" aria-label={`Excluir grupo ${group.name}`} onClick={() => props.onDeleteGroup(group.id)}><TrashIcon size={14} /></button></div>)}</div>}
      </div>
    </details>
  </section>;
}
