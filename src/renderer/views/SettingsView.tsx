import { useEffect, useRef, useState } from "react";
import {
  ActivityIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
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
  streams: "video",
  reconnect: "connection",
  log: "diagnostics",
};

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
