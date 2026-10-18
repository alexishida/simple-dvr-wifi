import type { CameraSummary } from "../../shared/contracts.js";
import {
  ActivityIcon,
  CalendarIcon,
  CameraIcon,
  CloseIcon,
  SearchIcon,
} from "../icons.js";

export interface RecordingSearchFilters {
  cameraId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  occurrence: "all" | "with-motion" | "without-motion";
}

export const EMPTY_RECORDING_FILTERS: RecordingSearchFilters = {
  cameraId: "",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  occurrence: "all",
};

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function RecordingSearch({
  cameras,
  applied,
  draft,
  onChange,
  loading,
  onSearch,
}: {
  cameras: CameraSummary[];
  applied: RecordingSearchFilters;
  draft: RecordingSearchFilters;
  onChange: (filters: RecordingSearchFilters) => void;
  loading: boolean;
  onSearch: (filters: RecordingSearchFilters) => void;
}): React.JSX.Element {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const preset =
    draft.startTime || draft.endTime
      ? "custom"
      : !draft.startDate && !draft.endDate
        ? "all"
        : draft.startDate === dateValue(today) &&
            draft.endDate === dateValue(today)
          ? "today"
          : draft.startDate === dateValue(yesterday) &&
              draft.endDate === dateValue(yesterday)
            ? "yesterday"
            : draft.startDate === dateValue(weekStart) &&
                draft.endDate === dateValue(today)
              ? "week"
              : "custom";
  const dirty = Object.keys(draft).some(
    (key) =>
      draft[key as keyof RecordingSearchFilters] !==
      applied[key as keyof RecordingSearchFilters],
  );
  const invalidPeriod = Boolean(
    draft.startDate &&
    draft.endDate &&
    `${draft.startDate}T${draft.startTime || "00:00"}` >
      `${draft.endDate}T${draft.endTime || "23:59"}`,
  );

  function update<K extends keyof RecordingSearchFilters>(
    key: K,
    value: RecordingSearchFilters[K],
  ): void {
    onChange({
      ...draft,
      [key]: value,
      ...(key === "startDate" && !value ? { startTime: "" } : {}),
      ...(key === "endDate" && !value ? { endTime: "" } : {}),
    });
  }

  function choosePeriod(value: string): void {
    const end = new Date();
    if (value === "yesterday") end.setDate(end.getDate() - 1);
    const start = new Date(end);
    if (value === "week") start.setDate(start.getDate() - 6);
    onChange({
      ...draft,
      startDate: value === "all" ? "" : dateValue(start),
      endDate: value === "all" ? "" : dateValue(end),
      startTime: "",
      endTime: "",
    });
  }

  return (
    <form
      className="recording-search"
      aria-labelledby="recording-search-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalidPeriod && !loading) onSearch(draft);
      }}
    >
      <div className="recording-search-heading">
        <span className="library-summary-icon">
          <SearchIcon size={22} />
        </span>
        <div>
          <h2 id="recording-search-title">Buscar gravações</h2>
          <p>Escolha a câmera e o período para encontrar o que precisa.</p>
        </div>
      </div>
      <div className="recording-search-main">
        <label
          className="recording-search-field"
          htmlFor="recording-search-camera"
        >
          <span>
            <CameraIcon size={16} /> Câmera
          </span>
          <select
            id="recording-search-camera"
            className="field-input"
            value={draft.cameraId}
            onChange={(event) => update("cameraId", event.target.value)}
          >
            <option value="">Todas as câmeras</option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </select>
        </label>
        <label
          className="recording-search-field"
          htmlFor="recording-search-occurrence"
        >
          <span>
            <ActivityIcon size={16} /> Movimento
          </span>
          <select
            id="recording-search-occurrence"
            className="field-input"
            value={draft.occurrence}
            onChange={(event) =>
              update(
                "occurrence",
                event.target.value as RecordingSearchFilters["occurrence"],
              )
            }
          >
            <option value="all">Todas as gravações</option>
            <option value="with-motion">Com movimento</option>
            <option value="without-motion">Sem movimento</option>
          </select>
        </label>
      </div>
      <fieldset className="recording-search-period">
        <legend>
          <CalendarIcon size={16} /> Período da gravação
        </legend>
        <div
          className="recording-period-shortcuts"
          aria-label="Atalhos de período"
        >
          {[
            ["all", "Todo o período"],
            ["today", "Hoje"],
            ["yesterday", "Ontem"],
            ["week", "Últimos 7 dias"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="btn btn-secondary btn-sm"
              aria-pressed={preset === value}
              onClick={() => choosePeriod(value!)}
            >
              <CalendarIcon size={14} />
              {label}
            </button>
          ))}
        </div>
        <div className="recording-date-range">
          <label
            className="recording-search-field"
            htmlFor="recording-search-start-date"
          >
            <span>Data inicial</span>
            <input
              id="recording-search-start-date"
              className="field-input"
              type="date"
              value={draft.startDate}
              max={draft.endDate || undefined}
              onChange={(event) => update("startDate", event.target.value)}
            />
          </label>
          <label
            className="recording-search-field"
            htmlFor="recording-search-start-time"
          >
            <span>Hora inicial</span>
            <input
              id="recording-search-start-time"
              className="field-input"
              type="time"
              disabled={!draft.startDate}
              value={draft.startTime}
              onChange={(event) => update("startTime", event.target.value)}
            />
          </label>
          <label
            className="recording-search-field"
            htmlFor="recording-search-end-date"
          >
            <span>Data final</span>
            <input
              id="recording-search-end-date"
              className="field-input"
              type="date"
              value={draft.endDate}
              min={draft.startDate || undefined}
              onChange={(event) => update("endDate", event.target.value)}
            />
          </label>
          <label
            className="recording-search-field"
            htmlFor="recording-search-end-time"
          >
            <span>Hora final</span>
            <input
              id="recording-search-end-time"
              className="field-input"
              type="time"
              disabled={!draft.endDate}
              value={draft.endTime}
              onChange={(event) => update("endTime", event.target.value)}
            />
          </label>
        </div>
        <p className="recording-search-hint">
          Horários locais. Deixe as horas em branco para incluir o dia inteiro.
        </p>
      </fieldset>
      {invalidPeriod && (
        <p className="form-message form-error" role="alert">
          <ActivityIcon size={16} /> O fim do período deve ser igual ou
          posterior ao início.
        </p>
      )}
      <div className="recording-search-footer">
        <span className="recording-search-hint" role="status">
          {dirty
            ? "Filtros alterados. Busque para atualizar os resultados."
            : "Os resultados correspondem aos filtros selecionados."}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onSearch(EMPTY_RECORDING_FILTERS)}
        >
          <CloseIcon size={16} /> Limpar filtros
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || invalidPeriod}
        >
          <SearchIcon size={17} />
          {loading ? "Buscando…" : "Buscar gravações"}
        </button>
      </div>
    </form>
  );
}
