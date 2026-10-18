import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { RecordingsView } from "../src/renderer/views/RecordingsView.tsx";
import styles from "../src/renderer/styles.css?inline";

export async function run() {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 40));
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.append(style);
  const container = document.createElement("main");
  container.className = "app-content";
  document.body.append(container);
  const root = createRoot(container);
  const cameras = [
    { id: "entrance", name: "Entrada principal" },
    { id: "garage", name: "Garagem e acesso de veículos" },
  ];
  const recordings = Array.from({ length: 12 }, (_, index) => ({
    id: `recording-${index}`,
    cameraId: index % 2 ? "garage" : "entrance",
    startedAt: new Date(2026, 9, 18, 10, index * 5).toISOString(),
    endedAt: new Date(2026, 9, 18, 10, index * 5 + 5).toISOString(),
    durationMs: 300_000,
    status: "completed",
    path: "fixture.mp4",
    bytes: 1_000_000,
  }));
  const calls = [];
  let outcome = "success";
  let motionCalls = 0;
  let release;
  let imported;
  const ok = (value) => ({ ok: true, value });
  window.api = {
    library: {
      recordings: async (filters) => {
        calls.push(filters);
        if (outcome === "error") throw new Error("offline");
        return ok(
          outcome === "empty"
            ? []
            : recordings.filter(
                (item) =>
                  !filters.cameraId || item.cameraId === filters.cameraId,
              ),
        );
      },
      metadata: async () => ok(null),
      recordingPreview: async () => ok({ dataUrl: null }),
      motionEvents: async () => {
        motionCalls++;
        return ok([]);
      },
      recordingSegments: async () => ok([]),
    },
    sdCard: {
      cameras: async () =>
        ok(cameras.map((camera) => ({ ...camera, supported: true }))),
      list: async () => {
        await new Promise((resolve) => {
          release = resolve;
        });
        if (outcome === "error") throw new Error("offline");
        return ok(
          outcome === "empty"
            ? []
            : recordings
                .slice(0, 2)
                .map((item) => ({ ...item, downloaded: false })),
        );
      },
      download: async (cameraId, id) => {
        imported = { cameraId, id };
        return ok({});
      },
    },
  };
  const button = (text) =>
    [...container.querySelectorAll("button")].find(
      (item) => item.textContent.trim() === text,
    );
  const click = (text) => {
    const target = button(text);
    check(target, `Missing button: ${text}`);
    flushSync(() => target.click());
  };
  const edit = (id, value) => {
    const input = document.getElementById(id);
    const prototype =
      input.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    flushSync(() =>
      input.dispatchEvent(
        new Event(input.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      ),
    );
  };
  flushSync(() => root.render(createElement(RecordingsView, { cameras })));
  await tick();
  check(
    container.querySelectorAll(".recording-card").length === 8,
    "Initial page should show 8 recordings",
  );
  check(motionCalls === 0, "Collapsed timeline must not query events");
  const initialCalls = calls.length;
  edit("recording-search-camera", "entrance");
  click("Hoje");
  await tick();
  check(
    calls.length === initialCalls,
    "Draft filters must not trigger a search",
  );
  click("Buscar gravações");
  await tick();
  check(calls.at(-1).cameraId === "entrance", "Camera filter not applied");
  const start = new Date(calls.at(-1).startAt);
  const end = new Date(calls.at(-1).endAt);
  check(
    start.getHours() === 0 && end.getHours() === 0 && end > start,
    "Today must include the whole local day",
  );
  check(
    container.querySelectorAll(".recording-card").length === 6,
    "Filtered count mismatch",
  );
  check(
    button("Hoje").getAttribute("aria-pressed") === "true",
    "Preset should remain selected after searching",
  );
  edit("recording-search-start-time", "18:00");
  edit("recording-search-end-time", "08:00");
  check(
    button("Buscar gravações").disabled,
    "Reversed time range must prevent search",
  );
  check(
    container.querySelector('.recording-search [role="alert"]'),
    "Invalid range needs explanation",
  );
  click("Limpar filtros");
  await tick();
  click("Próxima");
  await tick();
  check(
    container.querySelectorAll(".recording-card").length === 4,
    "Pagination failed",
  );
  click("Anterior");
  await tick();
  const select = container.querySelector(
    ".recording-card input[type=checkbox]",
  );
  flushSync(() => select.click());
  check(
    !container.querySelector(".library-selection-actions").hidden,
    "Batch actions must appear for selection",
  );
  click("Limpar seleção");
  check(
    container.querySelector(".library-selection-actions").hidden,
    "Batch actions must hide without selection",
  );
  outcome = "empty";
  click("Ontem");
  click("Buscar gravações");
  await tick();
  check(button("Ver todas as gravações"), "Empty state needs recovery action");
  outcome = "success";
  click("Ver todas as gravações");
  await tick();
  check(
    document.getElementById("recording-search-start-date").value === "",
    "Recovery must clear draft and applied filters",
  );
  outcome = "error";
  click("Atualizar");
  await tick();
  check(
    container.querySelector('.recording-search-error[role="alert"]'),
    "Fetch error must be announced",
  );
  check(
    !container.querySelector(".recording-library .empty-state"),
    "Fetch error must not be shown as empty success",
  );
  outcome = "success";
  click("Tentar novamente");
  await tick();
  check(container.querySelector(".recording-card"), "Retry failed");
  flushSync(() =>
    container.querySelector(".recording-timeline-disclosure summary").click(),
  );
  await tick();
  await tick();
  check(motionCalls > 0, "Opening timeline should fetch occurrences");
  flushSync(() =>
    container.querySelector(".recording-timeline-disclosure summary").click(),
  );
  flushSync(() => container.querySelector(".recording-preview").click());
  await tick();
  check(
    container.querySelector('[role="dialog"]'),
    "Clicking preview should open playback",
  );
  flushSync(() =>
    container.querySelector('[aria-label="Fechar reprodução"]').click(),
  );
  flushSync(() => document.getElementById("recordings-tab-sd-card").click());
  await tick();
  click("Buscar no cartão");
  check(
    document.getElementById("sd-card-camera").disabled &&
      document.getElementById("sd-card-date").disabled,
    "SD filters must stay stable during request",
  );
  release();
  await tick();
  click("Importar");
  await tick();
  check(
    imported.cameraId === "entrance" && button("Na biblioteca").disabled,
    "SD import should use result camera and update item",
  );
  outcome = "error";
  click("Buscar no cartão");
  release();
  await tick();
  check(
    container.querySelector('.sd-card-message[role="alert"]'),
    "SD transport failure should be an error",
  );
  outcome = "success";
  click("Buscar no cartão");
  release();
  await tick();
  flushSync(() => document.getElementById("recordings-tab-library").click());
  await tick();
  return {
    checks:
      "filters, periods, validation, pagination, selection, empty/error recovery, lazy timeline, playback, SD search/import",
  };
}
