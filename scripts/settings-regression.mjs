import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { SettingsView } from "../src/renderer/views/SettingsView.tsx";
import { CONFIG_DEFAULTS } from "../src/shared/config.ts";
import styles from "../src/renderer/styles.css?inline";

export async function run() {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.append(style);
  const container = document.createElement("main");
  container.className = "app-content";
  document.body.append(container);
  const root = createRoot(container);
  let saved;
  let calls = 0;
  let outcome = "success";
  let release;
  window.api = {
    config: {
      async save(config) {
        calls++;
        if (outcome === "pending")
          await new Promise((resolve) => {
            release = resolve;
          });
        if (outcome === "throw") throw new Error("offline");
        if (outcome === "error")
          return { ok: false, error: { message: "failure" } };
        if (outcome === "rejected")
          return { ok: true, value: { saved: false } };
        saved = structuredClone(config);
        return { ok: true, value: { saved: true } };
      },
    },
  };
  flushSync(() =>
    root.render(
      createElement(SettingsView, {
        initialConfig: CONFIG_DEFAULTS,
        onSaved: (config) => {
          saved = config;
        },
      }),
    ),
  );
  await tick();
  const button = (text) =>
    [...container.querySelectorAll("button")].find(
      (item) => item.textContent === text,
    );
  const click = (text) => flushSync(() => button(text).click());
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
  const submit = () =>
    flushSync(() =>
      container
        .querySelector("form")
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
  const status = () => container.querySelector('[role="status"]').textContent;

  check(
    button("Salvar alterações").disabled,
    "Unchanged settings must not save",
  );
  click("Armazenamento");
  edit("recordingsDir", "D:\\Videos");
  click("Conexão");
  edit("reconnect.maxAttempts", "15");
  click("Armazenamento");
  check(
    document.getElementById("recordingsDir").value === "D:\\Videos",
    "Draft lost across categories",
  );
  click("Salvar alterações");
  await tick();
  check(
    saved.recordingsDir === "D:\\Videos" && saved.reconnect.maxAttempts === 15,
    "Save must include all categories",
  );
  check(
    saved.log.maxFiles === CONFIG_DEFAULTS.log.maxFiles &&
      saved.log.maxBytes === CONFIG_DEFAULTS.log.maxBytes,
    "Hidden settings must be preserved",
  );
  check(
    status().includes("Configurações salvas") &&
      button("Salvar alterações").disabled,
    "Successful save must clear pending state",
  );

  edit("recordingsDir", "D:\\Other");
  click("Descartar alterações");
  check(
    document.getElementById("recordingsDir").value === "D:\\Videos",
    "Discard must restore latest save",
  );
  click("Conexão");
  edit("reconnect.initialDelayMs", "");
  click("Diagnóstico");
  const beforeInvalid = calls;
  submit();
  await tick();
  check(calls === beforeInvalid, "Invalid settings reached IPC");
  check(
    document.activeElement.id === "reconnect.initialDelayMs",
    "Validation must open category and focus field",
  );
  check(
    document.activeElement.getAttribute("aria-invalid") === "true",
    "Invalid input must be accessible",
  );
  edit("reconnect.initialDelayMs", "1500");
  edit("reconnect.maxAttempts", "1.5");
  submit();
  await tick();
  check(calls === beforeInvalid, "Fractional attempt count reached IPC");
  edit("reconnect.maxAttempts", "0");
  for (const failure of ["error", "rejected", "throw"]) {
    outcome = failure;
    submit();
    await tick();
    check(
      status().includes("Não foi possível salvar") &&
        !button("Salvar alterações").disabled,
      `Failure ${failure} must permit retry`,
    );
  }
  outcome = "pending";
  submit();
  await tick();
  const pendingCalls = calls;
  submit();
  check(
    calls === pendingCalls && container.querySelector("fieldset").disabled,
    "Duplicate saves or edits allowed while saving",
  );
  release();
  await tick();
  check(
    saved.reconnect.maxAttempts === 0 &&
      saved.reconnect.initialDelayMs === 1500,
    "Retry lost values or rejected valid zero",
  );
  click("Vídeo e desempenho");
  flushSync(() =>
    document.getElementById("streams.enableHardwareAcceleration").click(),
  );
  outcome = "success";
  submit();
  await tick();
  check(
    saved.streams.enableHardwareAcceleration === false,
    "Hardware switch must persist",
  );
  for (const name of [
    "Aparência",
    "Armazenamento",
    "Vídeo e desempenho",
    "Conexão",
    "Diagnóstico",
  ]) {
    click(name);
    for (const input of container.querySelectorAll("input, select")) {
      check(
        container.querySelector(`label[for="${input.id}"]`),
        `Missing label: ${input.id}`,
      );
      check(
        document.getElementById(
          input.getAttribute("aria-describedby").split(" ")[0],
        ),
        `Missing hint: ${input.id}`,
      );
    }
  }
  click("Conexão");
  return {
    passed: true,
    checks:
      "category drafts, full save, preserved fields, discard, validation, focus, IPC failures, retry, concurrent save, switch, labels",
  };
}
