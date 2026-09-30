import { useEffect, useRef, useState } from "react";
import {
  ActivityIcon,
  CalendarIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  ExportIcon,
  ImageIcon,
  SettingsIcon,
  VideoIcon,
  WifiIcon,
} from "../icons.js";
import {
  AppConfigSchema,
  CONFIG_DEFAULTS,
  type AppConfig,
  type StreamBehavior,
  type Theme,
  type LogLevel,
} from "../../shared/config.js";

interface SettingsViewProps {
  initialConfig: AppConfig | null;
  onSaved: (config: AppConfig) => void;
}

const CATEGORIES = [
  {
    id: "schedule",
    label: "Gravação agendada",
    description: "Defina períodos semanais para cada câmera ativa.",
    icon: CalendarIcon,
  },
  {
    id: "motion",
    label: "Movimento ONVIF",
    description: "Grave eventos com vídeo anterior e posterior ao movimento.",
    icon: ActivityIcon,
  },
  {
    id: "appearance",
    label: "Aparência",
    description: "Personalize a interface do aplicativo.",
    icon: SettingsIcon,
  },
  {
    id: "storage",
    label: "Armazenamento",
    description: "Escolha onde salvar as capturas e gravações das câmeras.",
    icon: ImageIcon,
  },
  {
    id: "video",
    label: "Vídeo e desempenho",
    description: "Ajuste as preferências de transmissão e o uso de recursos.",
    icon: VideoIcon,
  },
  {
    id: "connection",
    label: "Conexão",
    description: "Defina como tentar recuperar uma conexão interrompida.",
    icon: WifiIcon,
  },
  {
    id: "diagnostics",
    label: "Diagnóstico",
    description: "Configure o detalhamento dos registros do aplicativo.",
    icon: ActivityIcon,
  },
] as const;
type Category = (typeof CATEGORIES)[number]["id"];

const FIELD_CATEGORIES: Record<string, Category> = {
  theme: "appearance",
  snapshotDir: "storage",
  recordingsDir: "storage",
  retention: "storage",
  motion: "motion",
  streams: "video",
  reconnect: "connection",
  log: "diagnostics",
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Indisponível";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function SettingRow({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <label className="settings-label" htmlFor={id}>
          {label}
        </label>
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      </div>
      <div className="settings-control">
        {children}
        {error && (
          <p className="settings-field-error" id={`${id}-error`}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function SettingsView({
  initialConfig,
  onSaved,
}: SettingsViewProps): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig>(
    initialConfig ?? CONFIG_DEFAULTS,
  );
  const [baseline, setBaseline] = useState<AppConfig>(
    initialConfig ?? CONFIG_DEFAULTS,
  );
  const [category, setCategory] = useState<Category>("appearance");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [storageUsage, setStorageUsage] = useState<{
    freeBytes: number | null;
    totalBytes: number | null;
    usedBytes: number;
    byCamera: Array<{ cameraId: string; bytes: number }>;
  } | null>(null);
  const [alerts, setAlerts] = useState<Array<{ id: string; message: string; count: number }>>([]);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [retentionStatus, setRetentionStatus] = useState<{ lastRunAt: string | null; deleted: number; freedBytes: number; failures: number; noCandidates: boolean } | null>(null);
  const [scheduleCameraId, setScheduleCameraId] = useState("");
  const [schedulePeriods, setSchedulePeriods] = useState<Array<{ weekday: number; start: string; end: string; enabled: boolean }>>([]);
  const [scheduleCameras, setScheduleCameras] = useState<Array<{ id: string; name: string; active: boolean }>>([]);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<{ source: "manual" | "scheduled" | null; blocked: string | null; nextAt: string | null } | null>(null);
  const saving = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(config) !== JSON.stringify(baseline);
  const current = CATEGORIES.find((item) => item.id === category)!;
  const CategoryIcon = current.icon;

  useEffect(() => {
    setConfig(initialConfig ?? CONFIG_DEFAULTS);
    setBaseline(initialConfig ?? CONFIG_DEFAULTS);
  }, [initialConfig]);

  useEffect(() => {
    if (category !== "storage") return;
    let active = true;
    void window.api.library.storageUsage().then((result) => {
      if (active && result.ok) setStorageUsage(result.value);
    }).catch(() => active && setStorageUsage(null));
    void window.api.retention.status().then((result) => {
      if (active && result.ok) setRetentionStatus(result.value);
    });
    return () => { active = false; };
  }, [category, config.recordingsDir, config.snapshotDir]);

  useEffect(() => {
    if (category !== "diagnostics") return;
    let active = true;
    void window.api.alerts.list().then((result) => {
      if (active && result.ok) setAlerts(result.value);
    });
    return () => { active = false; };
  }, [category]);

  useEffect(() => {
    if (category !== "schedule") return;
    let active = true;
    void window.api.cameras.list().then((result) => {
      if (!active || !result.ok) return;
      const cameras = result.value.map(({ id, name, active: cameraActive }) => ({ id, name, active: cameraActive }));
      setScheduleCameras(cameras);
      setScheduleCameraId((current) => current || cameras[0]?.id || "");
    });
    return () => { active = false; };
  }, [category]);

  useEffect(() => {
    if (!scheduleCameraId) return;
    let active = true;
    void window.api.schedules.list(scheduleCameraId).then((result) => {
      if (active && result.ok) setSchedulePeriods(result.value.map(({ weekday, start, end, enabled }) => ({ weekday, start, end, enabled })));
    });
    void window.api.schedules.status(scheduleCameraId).then((result) => {
      if (active && result.ok) setScheduleStatus(result.value);
    });
    return () => { active = false; };
  }, [scheduleCameraId]);

  async function saveSchedule(): Promise<void> {
    if (!scheduleCameraId) return;
    if (schedulePeriods.some((period) => period.start === period.end)) {
      setScheduleMessage("O início e o fim não podem ser iguais.");
      return;
    }
    const result = await window.api.schedules.replace({ cameraId: scheduleCameraId, periods: schedulePeriods });
    setScheduleMessage(result.ok && result.value.saved ? "Agenda salva e aplicada." : result.ok ? "Não foi possível salvar a agenda." : result.error.message);
  }

  useEffect(() => {
    if (!pendingFocus.current) return;
    form.current
      ?.querySelector<HTMLElement>(`[id="${pendingFocus.current}"]`)
      ?.focus();
    pendingFocus.current = null;
  }, [errors, category]);

  function update<K extends keyof AppConfig>(
    key: K,
    value: AppConfig[K],
  ): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
    setErrors((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([path]) => path.split(".")[0] !== key),
      ),
    );
  }

  function inputProps(path: string) {
    return {
      id: path,
      className: "field-input",
      "aria-describedby": `${path}-hint${errors[path] ? ` ${path}-error` : ""}`,
      "aria-invalid": Boolean(errors[path]),
    };
  }

  function discard(): void {
    setConfig(baseline);
    setErrors({});
    setStatus("idle");
  }

  async function persist(): Promise<void> {
    if (saving.current || !dirty) return;
    const parsed = AppConfigSchema.safeParse(config);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        nextErrors[issue.path.join(".")] =
          "Informe um valor válido dentro dos limites indicados.";
      }
      setErrors(nextErrors);
      const firstPath = parsed.error.issues[0]?.path.join(".") ?? "";
      pendingFocus.current = firstPath;
      setCategory(FIELD_CATEGORIES[firstPath.split(".")[0] ?? ""] ?? category);
      return;
    }
    if (!baseline.retention.enabled && parsed.data.retention.enabled) {
      const { maxAgeDays, maxBytes } = parsed.data.retention;
      const limits = [
        maxAgeDays > 0 ? `${maxAgeDays} dia(s)` : null,
        maxBytes > 0 ? `${Math.round(maxBytes / (1024 * 1024))} MB` : null,
      ].filter(Boolean);
      const description = limits.length > 0
        ? `A mídia não protegida será elegível à limpeza ao ultrapassar qualquer limite configurado (${limits.join(" ou ")}).`
        : "Nenhum limite foi definido; a retenção não excluirá mídia até que você configure idade ou tamanho.";
      if (!window.confirm(`Ativar retenção automática?\n\n${description}\n\nMídia protegida nunca será removida.`)) {
        return;
      }
    }
    saving.current = true;
    setStatus("saving");
    try {
      const result = await window.api.config.save(parsed.data);
      if (!result.ok || !result.value.saved) {
        setStatus("error");
        return;
      }
      setBaseline(parsed.data);
      onSaved(parsed.data);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      saving.current = false;
    }
  }

  function numberInput(
    path: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
    unit?: string,
  ) {
    return (
      <div className="settings-unit-input">
        <input
          {...inputProps(path)}
          type="number"
          min={min}
          max={max}
          step={1}
          required
          value={Number.isNaN(value) ? "" : value}
          onChange={(event) => onChange(event.target.valueAsNumber)}
        />
        {unit && <span aria-hidden="true">{unit}</span>}
      </div>
    );
  }

  return (
    <form
      className="settings-page"
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void persist();
      }}
    >
      <nav className="settings-nav" aria-label="Categorias de configurações">
        {CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="settings-nav-item"
            aria-current={category === id ? "page" : undefined}
            aria-controls="settings-panel"
            onClick={() => setCategory(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section
        className="settings-panel"
        id="settings-panel"
        aria-labelledby="settings-heading"
      >
        <header className="settings-panel-header">
          <span className="settings-section-icon">
            <CategoryIcon size={24} />
          </span>
          <div>
            <h2 id="settings-heading">{current.label}</h2>
            <p>{current.description}</p>
          </div>
        </header>
        <fieldset className="settings-fields" disabled={status === "saving"}>
          <legend className="settings-legend">{current.label}</legend>
          {category === "appearance" && (
            <>
              <SettingRow
                id="theme"
                label="Tema da interface"
                hint="Escolha sua preferência de aparência para o aplicativo."
              >
                <select
                  {...inputProps("theme")}
                  value={config.theme}
                  onChange={(event) =>
                    update("theme", event.target.value as Theme)
                  }
                >
                  <option value="dark">Escuro (padrão)</option>
                  <option value="light">Claro</option>
                  <option value="system">Acompanhar o sistema</option>
                </select>
              </SettingRow>
              <div className="settings-note">
                <SettingsIcon size={18} />
                <p>
                  O tema escuro é o padrão para sessões prolongadas de
                  monitoramento.
                </p>
              </div>
            </>
          )}

          {category === "motion" && (
            <>
              <SettingRow id="motion.enabled" label="Gravação por movimento" hint="Inicia uma gravação quando a câmera envia um evento ONVIF de movimento.">
                <div className="settings-toggle">
                  <input {...inputProps("motion.enabled")} type="checkbox" role="switch" checked={config.motion.enabled} onChange={(event) => update("motion", { ...config.motion, enabled: event.target.checked })} />
                  <span>{config.motion.enabled ? "Ativada" : "Desativada"}</span>
                </div>
              </SettingRow>
              <SettingRow id="motion.prebufferSeconds" label="Vídeo anterior ao evento (segundos)" hint="De 0 a 30 segundos. Zero desativa o buffer; valores maiores mantêm um stream e gravação temporária ativos por câmera." error={errors["motion.prebufferSeconds"]}>
                {numberInput("motion.prebufferSeconds", config.motion.prebufferSeconds, 0, 30, (value) => update("motion", { ...config.motion, prebufferSeconds: value }))}
              </SettingRow>
              <SettingRow id="motion.postRecordSeconds" label="Vídeo após o fim do movimento (segundos)" hint="Mantém a gravação por 5 a 3.600 segundos após o evento de encerramento." error={errors["motion.postRecordSeconds"]}>
                {numberInput("motion.postRecordSeconds", config.motion.postRecordSeconds, 5, 3600, (value) => update("motion", { ...config.motion, postRecordSeconds: value }))}
              </SettingRow>
              <div className="settings-note"><ActivityIcon size={18} /><p>O buffer usa uma conexão RTSP adicional, processamento e até 128 MB de espaço temporário por câmera. A disponibilidade depende do suporte ONVIF e da conexão da câmera.</p></div>
            </>
          )}

          {category === "storage" && (
            <>
              <SettingRow
                id="recordingsDir"
                label="Pasta de gravações"
                hint="Caminho completo da pasta onde os vídeos serão salvos."
                error={errors.recordingsDir}
              >
                <input
                  {...inputProps("recordingsDir")}
                  maxLength={2048}
                  placeholder="Usar pasta padrão do aplicativo"
                  value={config.recordingsDir}
                  onChange={(event) =>
                    update("recordingsDir", event.target.value)
                  }
                />
              </SettingRow>
              <SettingRow
                id="snapshotDir"
                label="Pasta de capturas (snapshots)"
                hint="Caminho completo da pasta onde as imagens serão salvas."
                error={errors.snapshotDir}
              >
                <input
                  {...inputProps("snapshotDir")}
                  maxLength={2048}
                  placeholder="Usar pasta padrão do aplicativo"
                  value={config.snapshotDir}
                  onChange={(event) =>
                    update("snapshotDir", event.target.value)
                  }
                />
              </SettingRow>
              <div className="settings-note storage-usage" role="status">
                <ActivityIcon size={18} />
                <div>
                  <p>
                    Biblioteca: {formatBytes(storageUsage?.usedBytes ?? null)} · espaço livre: {formatBytes(storageUsage?.freeBytes ?? null)}
                  </p>
                  {storageUsage && storageUsage.byCamera.length > 0 && (
                    <p className="field-hint">
                      Por câmera: {storageUsage.byCamera.map((item) => `${item.cameraId.slice(0, 8)} (${formatBytes(item.bytes)})`).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              {retentionStatus?.lastRunAt && (
                <div className="settings-note">
                  <ActivityIcon size={18} />
                  <p>
                    Última retenção: {new Date(retentionStatus.lastRunAt).toLocaleString("pt-BR")} · {retentionStatus.deleted} removido(s), {formatBytes(retentionStatus.freedBytes)} liberados{retentionStatus.failures > 0 ? ` · ${retentionStatus.failures} falha(s)` : retentionStatus.noCandidates ? " · sem candidatos elegíveis" : ""}.
                  </p>
                </div>
              )}
              <SettingRow
                id="retention.enabled"
                label="Retenção automática"
                hint="Desativada por padrão. A ativação exige confirmação e nunca remove mídia protegida."
              >
                <label className="settings-toggle" htmlFor="retention.enabled">
                  <input
                    id="retention.enabled"
                    type="checkbox"
                    checked={config.retention.enabled}
                    onChange={(event) => update("retention", {
                      ...config.retention,
                      enabled: event.target.checked,
                    })}
                  />
                  Ativar retenção
                </label>
              </SettingRow>
              <SettingRow
                id="retention.maxAgeDays"
                label="Idade máxima (dias)"
                hint="Zero desativa este limite. A mídia é elegível ao ultrapassar este ou o limite de tamanho."
              >
                <input
                  id="retention.maxAgeDays"
                  className="field-input"
                  type="number"
                  min="0"
                  max="3650"
                  value={config.retention.maxAgeDays}
                  onChange={(event) => update("retention", {
                    ...config.retention,
                    maxAgeDays: Number(event.target.value),
                  })}
                />
              </SettingRow>
              <SettingRow
                id="retention.maxBytes"
                label="Limite de biblioteca (MB)"
                hint="Zero desativa este limite. Se ambos forem zero, nenhuma mídia será removida."
              >
                <input
                  id="retention.maxBytes"
                  className="field-input"
                  type="number"
                  min="0"
                  max="104857600"
                  value={Math.round(config.retention.maxBytes / (1024 * 1024))}
                  onChange={(event) => update("retention", {
                    ...config.retention,
                    maxBytes: Number(event.target.value) * 1024 * 1024,
                  })}
                />
              </SettingRow>
              <div className="settings-note">
                <ImageIcon size={18} />
                <p>
                  Deixe o campo vazio para usar a pasta local padrão. Alterar o
                  caminho não move os arquivos já existentes.
                </p>
              </div>
            </>
          )}

          {category === "video" && (
            <>
              <SettingRow
                id="streams.behavior"
                label="Preferência de transmissão"
                hint="O fluxo secundário (substream) tem menor resolução. O principal (main) prioriza a qualidade da imagem."
              >
                <select
                  {...inputProps("streams.behavior")}
                  value={config.streams.behavior}
                  onChange={(event) =>
                    update("streams", {
                      ...config.streams,
                      behavior: event.target.value as StreamBehavior,
                    })
                  }
                >
                  <option value="sub-first">Priorizar fluxo secundário</option>
                  <option value="main-only">Somente fluxo principal</option>
                  <option value="balanced">Equilibrado</option>
                </select>
              </SettingRow>
              <SettingRow
                id="streams.maxTranscodes"
                label="Conversões de vídeo simultâneas"
                hint="Limite de transcodificações: de 0 a 16. O padrão é 2; valores maiores exigem mais processamento."
                error={errors["streams.maxTranscodes"]}
              >
                {numberInput(
                  "streams.maxTranscodes",
                  config.streams.maxTranscodes,
                  0,
                  16,
                  (value) =>
                    update("streams", {
                      ...config.streams,
                      maxTranscodes: value,
                    }),
                )}
              </SettingRow>
              <SettingRow
                id="streams.enableHardwareAcceleration"
                label="Aceleração de hardware"
                hint="Use a GPU compatível para reprodução e interface. Requer reiniciar o aplicativo após salvar."
              >
                <div className="settings-toggle">
                  <input
                    {...inputProps("streams.enableHardwareAcceleration")}
                    className="settings-switch"
                    type="checkbox"
                    role="switch"
                    checked={config.streams.enableHardwareAcceleration}
                    onChange={(event) =>
                      update("streams", {
                        ...config.streams,
                        enableHardwareAcceleration: event.target.checked,
                      })
                    }
                  />
                  <span>
                    {config.streams.enableHardwareAcceleration
                      ? "Ativada"
                      : "Desativada"}
                  </span>
                </div>
              </SettingRow>
            </>
          )}

          {category === "connection" && (
            <>
              <div className="settings-note">
                <WifiIcon size={18} />
                <p>
                  As novas tentativas usam intervalos progressivos até atingir o
                  tempo máximo de espera.
                </p>
              </div>
              <SettingRow
                id="reconnect.initialDelayMs"
                label="Espera para a primeira tentativa"
                hint="De 500 a 60.000 ms. 1.000 ms equivale a 1 segundo."
                error={errors["reconnect.initialDelayMs"]}
              >
                {numberInput(
                  "reconnect.initialDelayMs",
                  config.reconnect.initialDelayMs,
                  500,
                  60000,
                  (value) =>
                    update("reconnect", {
                      ...config.reconnect,
                      initialDelayMs: value,
                    }),
                  "ms",
                )}
              </SettingRow>
              <SettingRow
                id="reconnect.maxDelayMs"
                label="Espera máxima entre tentativas"
                hint="De 1.000 a 300.000 ms. O padrão de 60.000 ms equivale a 1 minuto."
                error={errors["reconnect.maxDelayMs"]}
              >
                {numberInput(
                  "reconnect.maxDelayMs",
                  config.reconnect.maxDelayMs,
                  1000,
                  300000,
                  (value) =>
                    update("reconnect", {
                      ...config.reconnect,
                      maxDelayMs: value,
                    }),
                  "ms",
                )}
              </SettingRow>
              <SettingRow
                id="reconnect.maxAttempts"
                label="Número máximo de tentativas"
                hint="De 0 a 100 tentativas. Use 0 para desativar as tentativas automáticas."
                error={errors["reconnect.maxAttempts"]}
              >
                {numberInput(
                  "reconnect.maxAttempts",
                  config.reconnect.maxAttempts,
                  0,
                  100,
                  (value) =>
                    update("reconnect", {
                      ...config.reconnect,
                      maxAttempts: value,
                    }),
                )}
              </SettingRow>
            </>
          )}

          {category === "schedule" && (
            <>
              <div className="settings-note">
                <CalendarIcon size={18} />
                <p>A agenda só funciona enquanto o aplicativo estiver em execução. A gravação manual tem prioridade; parar uma gravação agendada pausa o período atual.</p>
              </div>
              <SettingRow id="schedule-camera" label="Câmera" hint="Câmeras desativadas permanecem na agenda, mas não iniciam gravações.">
                <select {...inputProps("schedule-camera")} value={scheduleCameraId} onChange={(event) => { setScheduleCameraId(event.target.value); setScheduleMessage(null); }}>
                  {scheduleCameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}{camera.active ? "" : " (desativada)"}</option>)}
                </select>
              </SettingRow>
              <div className="schedule-editor" aria-label="Períodos semanais">
                {schedulePeriods.map((period, index) => (
                  <div className="schedule-period" key={`${period.weekday}-${index}`}>
                    <select aria-label="Dia da semana" className="field-input" value={period.weekday} onChange={(event) => setSchedulePeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, weekday: Number(event.target.value) } : item))}>{WEEKDAYS.map((day, weekday) => <option key={day} value={weekday}>{day}</option>)}</select>
                    <input aria-label="Hora de início" className="field-input" type="time" value={period.start} onChange={(event) => setSchedulePeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} />
                    <span aria-hidden="true">até</span>
                    <input aria-label="Hora de término" className="field-input" type="time" value={period.end} onChange={(event) => setSchedulePeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} />
                    <label className="settings-toggle"><input type="checkbox" checked={period.enabled} onChange={(event) => setSchedulePeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} />Ativo</label>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSchedulePeriods((items) => items.filter((_, itemIndex) => itemIndex !== index))}><CloseIcon size={14} /> Remover</button>
                  </div>
                ))}
              </div>
              <div className="schedule-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setSchedulePeriods((items) => [...items, { weekday: new Date().getDay(), start: "08:00", end: "18:00", enabled: true }])}><CalendarIcon size={16} /> Adicionar período</button>
                <button type="button" className="btn btn-primary" disabled={!scheduleCameraId} onClick={() => void saveSchedule()}><CheckIcon size={16} /> Salvar agenda</button>
              </div>
              {scheduleStatus && <div className="settings-note" role="status"><ActivityIcon size={18} /><p>{scheduleStatus.source === "scheduled" ? "Gravando pela agenda." : scheduleStatus.source === "manual" ? "Gravando manualmente; o comando manual tem prioridade." : scheduleStatus.blocked ?? "Agenda pronta."}{scheduleStatus.nextAt ? ` Próximo início: ${new Date(scheduleStatus.nextAt).toLocaleString("pt-BR")}.` : ""}</p></div>}
              {scheduleMessage && <p className="field-hint" role="status">{scheduleMessage}</p>}
            </>
          )}

          {category === "diagnostics" && (
            <>
              <SettingRow
                id="log.level"
                label="Detalhamento dos registros"
                hint="Cada nível inclui os anteriores. Informações é o padrão para acompanhar o funcionamento do aplicativo."
              >
                <select
                  {...inputProps("log.level")}
                  value={config.log.level}
                  onChange={(event) =>
                    update("log", {
                      ...config.log,
                      level: event.target.value as LogLevel,
                    })
                  }
                >
                  <option value="error">Somente erros</option>
                  <option value="warn">Erros e avisos</option>
                  <option value="info">Informações (padrão)</option>
                  <option value="debug">Depuração (mais detalhes)</option>
                </select>
              </SettingRow>
              {alerts.length > 0 && (
                <div className="settings-note" role="status">
                  <ActivityIcon size={18} />
                  <div>
                    <p>Alertas locais</p>
                    {alerts.map((alert) => (
                      <p key={alert.id} className="field-hint">
                        {alert.message}{alert.count > 1 ? ` (${alert.count} ocorrências)` : ""}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void window.api.alerts.dismiss(alert.id).then(() => setAlerts((current) => current.filter((item) => item.id !== alert.id)))}>
                          <CloseIcon size={14} /> Dispensar
                        </button>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="settings-note">
                <ActivityIcon size={18} />
                <div>
                  <p>Histórico local</p>
                  <p className="field-hint">Exporte quedas de conexão e falhas de gravação. Credenciais, tokens e URLs autenticadas são removidos.</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void window.api.diagnostics.export().then((result) => setDiagnosticMessage(result.ok && result.value.exported ? "Diagnóstico exportado." : result.ok ? "Exportação cancelada." : result.error.message))}><ExportIcon size={14} /> Exportar diagnóstico</button>
                  {diagnosticMessage && <p className="field-hint" role="status">{diagnosticMessage}</p>}
                </div>
              </div>
              <div className="settings-note">
                <ActivityIcon size={18} />
                <p>
                  Use Depuração ao investigar um problema. Esse nível gera um
                  volume maior de registros.
                </p>
              </div>
            </>
          )}
        </fieldset>
      </section>

      <footer className="settings-savebar">
        <div
          className={`settings-save-status${status === "error" ? " is-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {status === "error" ? (
            <CloseIcon size={18} />
          ) : dirty ? (
            <EditIcon size={18} />
          ) : (
            <CheckIcon size={18} />
          )}
          <div>
            <strong>
              {status === "saving"
                ? "Salvando configurações…"
                : status === "error"
                  ? "Não foi possível salvar. Tente novamente."
                  : Object.keys(errors).length
                    ? "Revise os campos indicados."
                    : dirty
                      ? "Você tem alterações não salvas"
                      : status === "saved"
                        ? "Configurações salvas"
                        : "Nenhuma alteração pendente"}
            </strong>
            <p>
              {dirty
                ? "Salvar aplica as alterações de todas as categorias."
                : "Escolha uma categoria para ajustar suas preferências."}
            </p>
          </div>
        </div>
        <div className="settings-save-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!dirty || status === "saving"}
            onClick={discard}
          >
            <CloseIcon size={16} />
            Descartar alterações
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!dirty || status === "saving"}
          >
            <CheckIcon size={16} />
            {status === "saving" ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </footer>
    </form>
  );
}
