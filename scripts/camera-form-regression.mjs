import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { CameraForm } from "../src/renderer/views/CameraForm.tsx";
import { CamerasView } from "../src/renderer/views/CamerasView.tsx";
import styles from "../src/renderer/styles.css?inline";

let previewScreen;
export async function preview(screen) {
  await previewScreen(screen);
}

export async function run() {
  // about:blank lacks secure-context randomUUID; the application uses a local file origin.
  if (!crypto.randomUUID) crypto.randomUUID = () => "00000000-0000-4000-8000-000000000001";
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.append(style);
  const container = document.createElement("main");
  container.className = "app-content";
  document.body.append(container);
  const root = createRoot(container);
  let saved;
  let tested;
  let calls = 0;
  window.api = {
    cameras: {
      async discover() {
        return { ok: true, value: [{ host: "192.168.1.80", onvifUrl: "http://192.168.1.80:2020/onvif/device_service", endpointReference: "camera-epr", scopes: [], types: [], identity: { manufacturer: "Test", model: "Camera" } }] };
      },
      async cancelDiscovery() { return { ok: true, value: { cancelled: true } }; },
      async discoverActive(input) {
        check(input.address === "192.168.1.10", "Port discovery must use the selected interface");
        return { ok: true, value: [] };
      },
      async discoveryInterfaces() {
        return { ok: true, value: [{ name: "Wi-Fi", address: "192.168.1.10", netmask: "255.255.255.0" }] };
      },
      async create(input) {
        saved = input;
        calls++;
        return { ok: true, value: { duplicate: false } };
      },
      async update(input) {
        saved = input;
        return { ok: true, value: { updated: true } };
      },
      async testConnection(input) {
        tested = input;
        calls++;
        return {
          ok: true,
          value: {
            status: "connected",
            segments: [{ name: "rtsp", detail: "Conectado" }],
            identified:
              input.onvifUrl && !input.rtspUrl
                ? {
                    manufacturer: "TP-Link",
                    model: "Tapo C310",
                    serialNumber: "test-serial",
                    rtspUrl: "rtsp://192.168.1.60:554/stream1",
                    source: "onvif",
                  }
                : null,
          },
        };
      },
    },
  };
  const render = (props = {}) =>
    flushSync(() =>
      root.render(
        createElement(CameraForm, {
          key: JSON.stringify(props),
          advancedInitially: true,
          onSaved() {},
          onCancel() {},
          ...props,
        }),
      ),
    );
  const value = (id) => document.getElementById(id).value;
  const edit = (id, value) => {
    const input = document.getElementById(id);
    const select = input.tagName === "SELECT";
    Object.getOwnPropertyDescriptor(
      select ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    flushSync(() =>
      input.dispatchEvent(
        new Event(select ? "change" : "input", { bubbles: true }),
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
  const testConnection = () =>
    flushSync(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Testar conexão"))
        .click(),
    );
  const clickButton = (text) => {
    const button = [...container.querySelectorAll("button")].find((item) =>
      item.textContent.includes(text),
    );
    if (!button)
      throw new Error(
        `Button not found: ${text}; screen: ${container.textContent}`,
      );
    flushSync(() =>
      button.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
  };

  render();
  edit("cam-name", "ONVIF only");
  edit("cam-onvif", "http://192.168.1.90:2020/onvif/device_service");
  check(!document.getElementById("cam-host").required, "A valid ONVIF URL already supplies the host");
  submit();
  await tick();
  check(saved.host === "192.168.1.90", "URL-only ONVIF registration must infer the camera host");
  calls = 0;
  render({ initial: { name: "", host: "" } });
  edit("cam-model", "intelbras");
  check(
    value("cam-port") === "554" && value("cam-rtsp") === "",
    "Preset before host must not produce an invalid URL",
  );
  testConnection();
  await tick();
  check(calls === 0, "Incomplete preset reached IPC");
  edit("cam-name", "Garagem");
  edit("cam-host", "192.168.1.50");
  edit("cam-channel", "4");
  edit("cam-stream", "sub");
  edit("cam-port", "8554");
  edit("cam-user", "admin");
  edit("cam-pass", "test@:/?#% password");
  check(
    value("cam-rtsp") ===
      "rtsp://192.168.1.50:8554/cam/realmonitor?channel=4&subtype=1",
    "Preset does not track input changes",
  );
  testConnection();
  await tick();
  check(
    tested.rtspUrl === value("cam-rtsp") &&
      tested.password === "test@:/?#% password",
    "Test must send generated URL and separate credentials",
  );
  submit();
  await tick();
  check(
    saved.rtspUrl === tested.rtspUrl &&
      saved.manufacturer === "Intelbras" &&
      saved.model.includes("DVR"),
    "Save must preserve tested URL and selected family",
  );
  edit("cam-model", "tapo");
  check(
    !document.getElementById("cam-channel") && value("cam-stream") === "main",
    "Model switch must reset channel/stream controls",
  );
  check(
    value("cam-port") === "8554" && value("cam-pass") === tested.password,
    "Model switch lost port or credentials",
  );
  edit("cam-rtsp", "rtsp://192.168.1.50:8554/custom");
  edit("cam-host", "192.168.1.51");
  check(
    value("cam-model") === "" && value("cam-rtsp").endsWith("/custom"),
    "Manual URL was overwritten",
  );
  edit("cam-model", "hikvision");
  const generated = value("cam-rtsp");
  edit("cam-model", "");
  check(
    value("cam-rtsp") === generated,
    "Manual mode must retain generated URL",
  );
  edit("cam-model", "intelbras");
  edit("cam-channel", "0");
  const beforeInvalid = calls;
  submit();
  testConnection();
  await tick();
  check(calls === beforeInvalid, "Invalid channel reached IPC");

  render({
    editingId: "existing",
    initial: {
      name: "Existing",
      host: "camera",
      rtspUrl: "rtsp://camera/custom",
      port: 8554,
    },
  });
  check(
    !document.getElementById("cam-model") &&
      value("cam-rtsp") === "rtsp://camera/custom",
    "Editing an existing camera must preserve its configuration",
  );
  testConnection();
  await tick();
  check(
    tested.cameraId === "existing" && tested.password === null,
    "Blank password must identify the saved camera for main-process credential lookup",
  );
  edit("cam-pass", "replacement-password");
  testConnection();
  await tick();
  check(
    tested.cameraId === "existing" &&
      tested.password === "replacement-password",
    "The password field must be editable and the test must use its current value",
  );
  submit();
  await tick();
  check(
    saved.id === "existing" && saved.password === "replacement-password",
    "Saving the edit must persist the replacement password",
  );
  edit("cam-pass", "");
  submit();
  await tick();
  check(
    saved.password === null,
    "Saving a blank password must preserve the stored credential",
  );
  render({
    initial: {
      name: "Entrada",
      host: "192.168.1.60",
      onvifUrl: "http://192.168.1.60/onvif/device_service",
    },
  });
  check(
    value("cam-rtsp") === "",
    "Discovery draft should start without a guessed RTSP URL",
  );
  testConnection();
  await tick();
  check(
    value("cam-rtsp") === "rtsp://192.168.1.60:554/stream1",
    "Test did not apply the verified ONVIF stream URI",
  );
  submit();
  await tick();
  check(
    saved.model === "Tapo C310" &&
      saved.serialNumber === "test-serial" &&
      saved.rtspUrl === value("cam-rtsp"),
    "Identified camera data was not saved",
  );
  edit("cam-model", "mibo");
  submit();
  await tick();
  check(
    saved.manufacturer === "Intelbras" &&
      saved.model.includes("iM4") &&
      saved.serialNumber === null,
    "Changing the preset retained stale ONVIF identity",
  );
  render({
    editingId: "existing",
    initial: {
      name: "Câmera de teste",
      host: "192.168.1.50",
      username: "camera-user",
      onvifUrl: "http://192.168.1.50:2020/onvif/device_service",
      rtspUrl: "rtsp://192.168.1.50:554/stream1",
    },
  });
  flushSync(() =>
    root.render(
      createElement(CamerasView, {
        key: "detected-flow",
        cameras: [],
        onRefresh() {},
      }),
    ),
  );
  clickButton("Adicionar");
  await tick();
  check(
    container.textContent.includes("Detectar") &&
      container.textContent.includes("Configurar por IP") &&
      container.textContent.includes("URL manualmente"),
    "Camera onboarding must offer automatic discovery, IP, and manual URL paths",
  );
  clickButton("URL manualmente");
  await tick();
  check(
    Boolean(document.getElementById("cam-rtsp")) &&
      Boolean(document.getElementById("cam-onvif")),
    "Manual onboarding must expose the advanced URL fields",
  );
  const openIp = async () => {
    flushSync(() => root.render(createElement(CamerasView, {
      key: `ip-regression-${Math.random()}`, cameras: [], onRefresh() {},
    })));
    clickButton("Adicionar");
    clickButton("Configurar por IP");
    edit("camera-host", "192.168.1.80");
    edit("camera-user", "local-user");
    edit("camera-password", "local-password");
    await tick();
  };
  await openIp();
  clickButton("Inserir URL manual");
  check(value("cam-host") === "192.168.1.80" && value("cam-user") === "local-user" && value("cam-pass") === "local-password", "Manual fallback lost the IP or credentials");
  await openIp();
  window.api.cameras.autoConfigure = async () => ({ ok: true, value: {
    status: "unavailable", onvifUrl: "http://192.168.1.80/onvif/device_service",
    identified: null, segments: [{ name: "rtsp", detail: "Stream indisponível" }],
  } });
  clickButton("Configurar automaticamente");
  await tick();
  check(value("camera-password") === "local-password" && value("camera-user") === "local-user", "Failed automatic setup must stay on the credentials step");
  check(container.textContent.includes("Stream indisponível"), "Fallback hid the failure details");
  clickButton("Inserir URL manual");
  check(value("cam-onvif") === "http://192.168.1.80/onvif/device_service", "Manual fallback lost the discovered endpoint");
  clickButton("Voltar");
  check(value("camera-password") === "local-password", "Back from manual must restore access data");
  clickButton("Inserir URL manual");
  clickButton("Cancelar");
  check(!document.getElementById("camera-host"), "Cancelling fallback reopened the abandoned setup");
  await openIp();
  let finishConfiguration;
  window.api.cameras.autoConfigure = () => new Promise((resolve) => { finishConfiguration = resolve; });
  clickButton("Configurar automaticamente");
  clickButton("Voltar");
  finishConfiguration({ ok: true, value: {
    status: "connected", onvifUrl: null, segments: [],
    identified: { manufacturer: "Test", model: "Camera", serialNumber: null, rtspUrl: "rtsp://192.168.1.80/live" },
  } });
  await tick();
  check(!document.getElementById("cam-name"), "Cancelled automatic setup reopened its form after a late response");

  clickButton("Detectar automaticamente");
  await tick();
  await tick();
  check(container.textContent.includes("Test Camera"), `Opening discovery must start the quick scan: ${container.textContent}`);
  clickButton("Test Camera");
  edit("camera-user", "camera-account");
  edit("camera-password", "correct-password");
  clickButton("Voltar");
  check(container.textContent.includes("Test Camera"), "Back must preserve discovery results");
  clickButton("Test Camera");
  check(value("camera-password") === "", "Selecting a device must not reuse another attempt's password");
  edit("camera-user", "camera-account");
  edit("camera-password", "correct-password");
  window.api.cameras.autoConfigure = async (input) => {
    check(input.onvifUrl === "http://192.168.1.80:2020/onvif/device_service", "Automatic setup must use the discovered port");
    return { ok: true, value: { status: "connected", segments: [], onvifUrl: input.onvifUrl,
      identified: { manufacturer: "Test", model: "Camera", serialNumber: "serial-auto", rtspUrl: "rtsp://192.168.1.80/live" } } };
  };
  clickButton("Configurar automaticamente");
  await tick();
  check(value("cam-name") === "Test Camera", "Validated device must reach confirmation");
  edit("cam-name", "Entrada automática");
  submit();
  await tick();
  check(saved.name === "Entrada automática" && saved.password === "correct-password" && saved.epr === "camera-epr", "Automatic create lost the name, credential or discovery identifier");
  check(!document.getElementById("cam-name") && container.textContent.includes("Adicionar câmera"), "Successful registration must return to the camera list");

  clickButton("Adicionar");
  let finishDiscovery;
  const originalDiscover = window.api.cameras.discover;
  window.api.cameras.discover = () => new Promise((resolve) => { finishDiscovery = resolve; });
  clickButton("Detectar automaticamente");
  await tick();
  clickButton("Cancelar busca");
  finishDiscovery(await originalDiscover());
  await tick();
  check(container.textContent.includes("Busca cancelada") && !container.textContent.includes("Test Camera"), "Cancelled discovery must stay on the search screen and ignore late results");
  window.api.cameras.discover = originalDiscover;
  clickButton("Buscar por portas");
  await tick();
  check(container.textContent.includes("Nenhum serviço de câmera"), "An empty port scan must explain how to continue");
  clickButton("Configurar por IP");
  check(Boolean(document.getElementById("camera-host")), "Empty discovery must allow direct IP setup");

  previewScreen = async (screen) => {
    flushSync(() => root.render(createElement(CamerasView, {
      key: `layout-${screen}-${Math.random()}`,
      cameras: [],
      onRefresh() {},
    })));
    clickButton("Adicionar");
    await tick();
    if (screen === "manual") clickButton("URL manualmente");
    if (screen === "ip") clickButton("Configurar por IP");
    if (screen === "discovery" || screen === "confirmed") clickButton("Detectar automaticamente");
    await tick();
    if (screen === "confirmed") {
      clickButton("Test Camera");
      clickButton("Configurar automaticamente");
      await tick();
    }
  };
  return "Preset generation, test/save payloads, validation, manual override and existing-camera editing passed";
}
