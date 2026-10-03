import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { CameraForm } from "../src/renderer/views/CameraForm.tsx";
import styles from "../src/renderer/styles.css?inline";

export async function run() {
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

  render();
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
  check(tested.cameraId === "existing" && tested.password === null,
    "Blank password must identify the saved camera for main-process credential lookup");
  edit("cam-pass", "replacement-password");
  testConnection();
  await tick();
  check(tested.cameraId === "existing" && tested.password === "replacement-password",
    "The password field must be editable and the test must use its current value");
  submit();
  await tick();
  check(saved.id === "existing" && saved.password === "replacement-password",
    "Saving the edit must persist the replacement password");
  edit("cam-pass", "");
  submit();
  await tick();
  check(saved.password === null, "Saving a blank password must preserve the stored credential");
  render({ initial: {
    name: "Entrada",
    host: "192.168.1.60",
    onvifUrl: "http://192.168.1.60/onvif/device_service",
  } });
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
  render({ editingId: "existing", initial: {
    name: "Câmera de teste", host: "192.168.1.50", username: "camera-user",
    onvifUrl: "http://192.168.1.50:2020/onvif/device_service",
    rtspUrl: "rtsp://192.168.1.50:554/stream1",
  } });
  return "Preset generation, test/save payloads, validation, manual override and existing-camera editing passed";
}
