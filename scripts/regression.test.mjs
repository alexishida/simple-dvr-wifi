import assert from "node:assert/strict";
import test from "node:test";
import { PtzControlService } from "../src/main/services/ptz-control.ts";
import { decideResourceState } from "../src/workers/media/resource-policy.ts";
import { MotionSubscriptionRegistry } from "../src/main/services/motion-subscriptions.ts";
import { MotionEventNormalizer, MotionRecordingTimers, MOTION_MISSING_END_TIMEOUT_MS, parseOnvifMotionNotification, parseOnvifMotionNotifications } from "../src/main/services/motion-events.ts";
import { buildProbeMessage, discoverOnvifDevices, parseProbeMatches } from "../src/main/services/onvif-discovery.ts";
import { SdCardAdapterRegistry } from "../src/main/services/sd-card-adapter.ts";
import { cameraTestCredentials } from "../src/main/services/camera-test-credentials.ts";

test("editing a camera tests stored per-service credentials without exposing them to the form", async () => {
  const camera = { id: "camera", endpoints: [
    { service: "onvif", url: "http://camera:2020/onvif/device_service" },
    { service: "rtsp", url: "rtsp://camera:554/stream1" },
  ] };
  const loads = [];
  const load = async (id, service) => {
    loads.push([id, service]);
    return { username: "user", password: `${service}-saved` };
  };
  for (const endpoint of camera.endpoints) {
    assert.deepEqual(await cameraTestCredentials({ camera, ...endpoint, username: "user", password: null, load }),
      { username: "user", password: `${endpoint.service}-saved` });
  }
  assert.deepEqual(loads, [["camera", "onvif"], ["camera", "rtsp"]]);
  assert.deepEqual(await cameraTestCredentials({ camera, service: "rtsp", url: "rtsp://other/live", username: "new-user", password: "new-password", load }),
    { username: "new-user", password: "new-password" });
  assert.equal(loads.length, 2, "Explicit passwords must not load stored secrets");
  for (const url of ["rtsp://other:554/stream1", "rtsp://camera:8554/stream1", "rtsp://camera:554/changed"]) {
    await assert.rejects(cameraTestCredentials({ camera, service: "rtsp", url, username: "user", password: null, load }), /endereço.*mudou/);
  }
  assert.equal(loads.length, 2, "Unregistered destinations must be rejected before loading secrets");
  await assert.rejects(cameraTestCredentials({ camera, ...camera.endpoints[0], username: "changed", password: null, load }), /usuário mudou/);
  await assert.rejects(cameraTestCredentials({ camera, ...camera.endpoints[0], username: "user", password: null, load: async () => null }), /Não há senha salva/);
  assert.deepEqual(await cameraTestCredentials({ camera: null, ...camera.endpoints[0], username: null, password: null, load }), { username: null, password: null });
});
import { autoRtspCandidate } from "../src/main/services/camera-auto-config.ts";
import { presetForOnvifIdentity } from "../src/shared/camera-presets.ts";
import { OnvifAdapter, createFetchOnvifTransport } from "../src/workers/camera/onvif-adapter.ts";
import { OnvifSimulator } from "../src/workers/simulators/onvif-simulator.ts";
import { generateMediaMtxConfig } from "../src/workers/media/mediamtx-config.ts";

test("ONVIF identity uses the local RTSP reference only for specific models", () => {
  assert.equal(presetForOnvifIdentity("Intelbras", "Mibo iM4-C")?.id, "mibo");
  assert.equal(presetForOnvifIdentity("TP-Link", "Tapo C310")?.id, "tapo");
  assert.equal(presetForOnvifIdentity("D-Link", "DCS-942L")?.id, "dlink-942");
  assert.equal(presetForOnvifIdentity("Haiz", "IP Camera"), null);
  assert.equal(presetForOnvifIdentity("Unknown", "Tapo C310"), null);
});

test("automatic RTSP prefers the ONVIF URI and keeps credentials out of the URL", () => {
  const identity = { manufacturer: "TP-Link", model: "Tapo C310", firmwareVersion: "", serialNumber: "" };
  assert.deepEqual(autoRtspCandidate({ identity, rtspMainUrl: "rtsp://admin:secret@192.168.1.60/live" }, "192.168.1.60", null), {
    url: "rtsp://192.168.1.60/live", source: "onvif",
  });
  assert.deepEqual(autoRtspCandidate({ identity, rtspMainUrl: null }, "192.168.1.60", null), {
    url: "rtsp://192.168.1.60:554/stream1", source: "reference",
  });
  assert.equal(autoRtspCandidate({ identity: { ...identity, manufacturer: "Haiz" }, rtspMainUrl: null }, "192.168.1.60", null), null);
});

test("MediaMTX records the original audio track in fMP4 without tying it to player mute", async (t) => {
  const directory = await temporaryDirectory(t);
  const result = generateMediaMtxConfig({
    rtspUrl: "rtsp://camera.local/main",
    path: "camera-audio",
    apiToken: "api-token",
    webrtcToken: "viewer-token",
    rtmpToken: "rtmp-token",
    srtToken: "srt-token",
    httpPort: 18_000,
    rtspPort: 18_003,
    rtmpPort: 18_004,
    configDir: directory,
    recordPath: join(directory, "recordings", "%path", "%Y-%m-%d", "%H-%M-%S-%f"),
    recordSegmentDurationMs: 2_000,
  });
  const config = await readFile(result.configPath, "utf8");
  assert.match(config, /source: "rtsp:\/\/camera\.local\/main"/);
  assert.match(config, /recordFormat: fmp4/);
  assert.match(config, /recordPartDuration: 1s/);
  assert.match(config, /recordSegmentDuration: 2000ms/);
  assert.doesNotMatch(config, /audio.*(?:disable|mute|transcod)/i);
});

test("ONVIF identity from a simulated camera selects a model-specific RTSP fallback", async (t) => {
  const camera = new OnvifSimulator({ manufacturer: "TP-Link", model: "Tapo C310" });
  await camera.start();
  t.after(() => camera.stop());
  const info = await new OnvifAdapter({
    deviceServiceUrl: camera.url,
    username: "admin",
    password: "admin",
    transport: createFetchOnvifTransport(),
  }).detect();
  assert.equal(info.identity.model, "Tapo C310");
  assert.deepEqual(autoRtspCandidate(info, "192.168.1.60", null), {
    url: "rtsp://192.168.1.60:554/stream1",
    source: "reference",
  });
});

test("ONVIF profiles without optional encoders preserve Intelbras PTZ and service URIs", async () => {
  for (const includeVideo of [true, false]) {
    const requests = [];
    const adapter = new OnvifAdapter({
      deviceServiceUrl: "http://camera.local/onvif/device_service",
      transport: {
        post: async (url, body) => {
          requests.push({ url, body });
          let response = "<Success/>";
          if (body.includes("GetDeviceInformation")) response = "<GetDeviceInformationResponse><Manufacturer>IntelBras</Manufacturer><Model>iM4-C</Model></GetDeviceInformationResponse>";
          if (body.includes("GetServices")) response = "<GetServicesResponse/>";
          if (body.includes("GetCapabilities")) response = '<GetCapabilitiesResponse><Capabilities><Media><XAddr>http://camera.local/onvif/media_service</XAddr></Media><PTZ><XAddr>http://camera.local/onvif/ptz_service</XAddr></PTZ></Capabilities></GetCapabilitiesResponse>';
          if (body.includes("GetProfiles")) response = `<GetProfilesResponse>${[
            ["MainStream", 1920, 1080, 20], ["SubStream", 640, 480, 15],
          ].map(([name, width, height, fps], index) => `<Profiles token="MediaProfile${index}"><Name>${name}</Name>${includeVideo ? `<VideoEncoderConfiguration><Encoding>H264</Encoding><Resolution><Width>${width}</Width><Height>${height}</Height></Resolution><RateControl><FrameRateLimit>${fps}</FrameRateLimit></RateControl></VideoEncoderConfiguration>` : ""}<PTZConfiguration token="PTZConfig"/></Profiles>`).join("")}</GetProfilesResponse>`;
          if (body.includes("GetStreamUri")) response = `<GetStreamUriResponse><MediaUri><Uri>rtsp://camera.local/${body.includes("MediaProfile1") ? "sub" : "main"}</Uri></MediaUri></GetStreamUriResponse>`;
          if (body.includes("GetSnapshotUri")) response = "<GetSnapshotUriResponse><MediaUri><Uri>http://camera.local/snapshot</Uri></MediaUri></GetSnapshotUriResponse>";
          return { status: 200, body: `<Envelope><Body>${response}</Body></Envelope>` };
        },
      },
    });
    const info = await adapter.detect();
    assert.equal(info.profiles.length, 2, "Missing optional encoders must not discard profiles");
    assert.equal(info.ptzSupported, true);
    assert.equal(info.capabilities.ptz, "supported");
    assert.deepEqual(info.profiles.map(({ audioCodec }) => audioCodec), [null, null]);
    assert.deepEqual(info.profiles.map(({ codec, width, height, fps }) => [codec, width, height, fps]),
      includeVideo ? [["H264", 1920, 1080, 20], ["H264", 640, 480, 15]] : [[null, null, null, null], [null, null, null, null]]);
    assert.equal(info.rtspMainUrl, "rtsp://camera.local/main");
    assert.equal(info.rtspSubUrl, "rtsp://camera.local/sub");
    assert.equal(info.snapshotUri, "http://camera.local/snapshot");
    await adapter.continuousMove({ profileToken: "main", velocity: { pan: 0.2 } });
    await adapter.stop({ profileToken: "main", panTilt: true });
    for (const request of requests.slice(-2)) {
      assert.equal(request.url, "http://camera.local/onvif/ptz_service");
      assert.match(request.body, /<tptz:ProfileToken>MediaProfile0<\/tptz:ProfileToken>/);
    }
    assert.match(requests.at(-2).body, /<tptz:ContinuousMove>/);
    assert.match(requests.at(-1).body, /<tptz:Stop>/);
  }
});

test("SD-card adapter registry selects only explicit camera support", () => {
  const adapter = { id: "test", supports: (camera) => camera.host === "supported", detail: () => "Teste", list: async () => [], download: async () => ({ path: "", imported: false }) };
  const registry = new SdCardAdapterRegistry([adapter]);
  assert.equal(registry.forCamera({ host: "supported" }).id, "test");
  assert.deepEqual(registry.describe({ host: "unsupported" }), { supported: false, detail: "Consulta do cartão SD indisponível para este modelo." });
});

test("WS-Discovery probe and responses keep only bounded HTTP(S) ONVIF endpoints", () => {
  const probe = buildProbeMessage("urn:uuid:camera-test");
  assert.match(probe, /NetworkVideoTransmitter/);
  assert.match(probe, /urn:uuid:camera-test/);
  const matches = parseProbeMatches(`<?xml version="1.0"?>
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><d:ProbeMatches xmlns:d="http://docs.oasis-open.org/ws-dd/ns/discovery">
      <d:ProbeMatch><a:EndpointReference xmlns:a="http://www.w3.org/2005/08/addressing"><a:Address>urn:uuid:front-door</a:Address></a:EndpointReference><d:Types>dn:NetworkVideoTransmitter</d:Types><d:Scopes>onvif://www.onvif.org/name/Front%20door onvif://www.onvif.org/Profile/Streaming</d:Scopes><d:XAddrs>http://192.168.1.30/onvif/device_service rtsp://192.168.1.30/ignored</d:XAddrs></d:ProbeMatch>
      <d:ProbeMatch><a:EndpointReference xmlns:a="http://www.w3.org/2005/08/addressing"><a:Address>urn:uuid:front-door</a:Address></a:EndpointReference><d:XAddrs>http://192.168.1.30/onvif/device_service</d:XAddrs></d:ProbeMatch>
      <d:ProbeMatch><d:XAddrs>ftp://192.168.1.31/not-onvif</d:XAddrs></d:ProbeMatch>
    </d:ProbeMatches></s:Body></s:Envelope>`);
  assert.deepEqual(matches, [{ endpointReference: "urn:uuid:front-door", host: "192.168.1.30", onvifUrl: "http://192.168.1.30/onvif/device_service", scopes: ["onvif://www.onvif.org/name/Front%20door", "onvif://www.onvif.org/Profile/Streaming"], types: ["dn:NetworkVideoTransmitter"] }]);
  assert.deepEqual(parseProbeMatches("<!DOCTYPE x><x />"), []);
});

test("WS-Discovery caps a datagram at one hundred valid devices", () => {
  const matches = Array.from({ length: 101 }, (_, index) => `
    <d:ProbeMatch><d:XAddrs>http://192.168.10.${index + 1}/onvif/device_service</d:XAddrs></d:ProbeMatch>`).join("");
  const devices = parseProbeMatches(`<?xml version="1.0"?>
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><d:ProbeMatches xmlns:d="http://docs.oasis-open.org/ws-dd/ns/discovery">${matches}</d:ProbeMatches></s:Body></s:Envelope>`);
  assert.equal(devices.length, 100);
  assert.equal(devices[0].host, "192.168.10.1");
  assert.equal(devices.at(-1).host, "192.168.10.100");
});

test("WS-Discovery merges multiple interfaces, supports selection, and handles no interfaces", async () => {
  const interfaces = [
    { name: "Ethernet", address: "192.168.1.2" },
    { name: "Wi-Fi", address: "10.0.0.2" },
  ];
  const scans = [];
  const scanner = async (network) => {
    scans.push(network.address);
    return network.address === "192.168.1.2"
      ? [{ endpointReference: "urn:uuid:front", host: "192.168.1.30", onvifUrl: "http://192.168.1.30/onvif/device_service", scopes: [], types: [] }]
      : [
          { endpointReference: "urn:uuid:front", host: "192.168.1.30", onvifUrl: "http://192.168.1.30/onvif/device_service", scopes: [], types: [] },
          { endpointReference: "urn:uuid:garage", host: "10.0.0.10", onvifUrl: "http://10.0.0.10/onvif/device_service", scopes: [], types: [] },
        ];
  };
  const devices = await discoverOnvifDevices({ interfaces, scanner });
  assert.deepEqual(scans, ["192.168.1.2", "10.0.0.2"]);
  assert.deepEqual(devices.map((device) => device.host), ["10.0.0.10", "192.168.1.30"]);
  scans.length = 0;
  const selected = await discoverOnvifDevices({ address: "10.0.0.2", interfaces, scanner });
  assert.deepEqual(scans, ["10.0.0.2"]);
  assert.equal(selected.length, 2);
  assert.deepEqual(await discoverOnvifDevices({ interfaces: [], scanner }), []);
});

test("WS-Discovery deduplicates by endpoint or identifier and rejects invalid injected results", async () => {
  const devices = await discoverOnvifDevices({
    interfaces: [{ name: "Ethernet", address: "192.168.1.2" }],
    scanner: async () => [
      { endpointReference: "urn:uuid:front", host: "wrong-host", onvifUrl: "http://192.168.1.30/onvif/device_service", scopes: [], types: [] },
      { endpointReference: "urn:uuid:front", host: "192.168.1.31", onvifUrl: "http://192.168.1.31/onvif/device_service", scopes: ["onvif://www.onvif.org/name/Front"], types: [] },
      { endpointReference: "urn:uuid:garage", host: "192.168.1.30", onvifUrl: "http://192.168.1.30/onvif/device_service", scopes: [], types: ["dn:NetworkVideoTransmitter"] },
      { endpointReference: null, host: "ignored", onvifUrl: "ftp://192.168.1.40/not-onvif", scopes: [], types: [] },
    ],
  });

  assert.deepEqual(devices, [{
    endpointReference: "urn:uuid:front",
    host: "192.168.1.30",
    onvifUrl: "http://192.168.1.30/onvif/device_service",
    scopes: ["onvif://www.onvif.org/name/Front"],
    types: ["dn:NetworkVideoTransmitter"],
  }]);
});

test("WS-Discovery stops an injected scan when cancelled", async () => {
  const controller = new AbortController();
  let scannerObservedAbort = false;
  const pending = discoverOnvifDevices({
    interfaces: [{ name: "Ethernet", address: "192.168.1.2" }],
    signal: controller.signal,
    scanner: (_network, _timeout, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        scannerObservedAbort = true;
        reject(new Error("cancelled"));
      }, { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(pending, /cancelada/);
  assert.equal(scannerObservedAbort, true);
});

function ptzFixture(t, failures = 1) {
  const timers = new Map();
  const calls = [];
  let nextTimer = 0;
  let attempts = 0;
  const controller = new PtzControlService(
    {
      continuousMove: async () => {
        calls.push("move");
      },
      stop: async () => {
        calls.push("stop");
        if (++attempts <= failures) throw new Error("camera unavailable");
      },
    },
    "main",
    {
      clock: {
        setTimeout: (callback, delay) => {
          const id = ++nextTimer;
          timers.set(id, { callback, delay });
          return id;
        },
        clearTimeout: (id) => timers.delete(id),
      },
    },
  );
  t.after(() => controller.shutdown());
  return { controller, timers, calls };
}

test("PTZ repeated stop retries an unconfirmed stop instead of cancelling recovery", async (t) => {
  const { controller, timers, calls } = ptzFixture(t);
  await controller.startMove("camera", { pan: 0.5 });
  await controller.stop("pointer_release");
  assert.equal(timers.size, 1);
  await controller.stop("blur");
  assert.deepEqual(calls, ["move", "stop", "stop"]);
  assert.equal(timers.size, 0);
  assert.equal(controller.isMoving, false);
  assert.equal(controller.state.stopFailures, 0);
});

test("PTZ blocks new movement until a failed stop is confirmed", async (t) => {
  const { controller, calls } = ptzFixture(t);
  await controller.startMove("camera", { pan: 0.5 });
  await controller.stop("pointer_release");
  assert.equal(controller.isMoving, true);
  assert.equal(controller.isStopBlocked, true);
  await assert.rejects(controller.startMove("camera", { pan: -0.5 }));
  await assert.rejects(controller.renew("camera", { pan: -0.5 }));
  assert.deepEqual(calls, ["move", "stop"]);
  await controller.stop("blur");
  await controller.startMove("camera", { pan: -0.5 });
  assert.deepEqual(calls, ["move", "stop", "stop", "move"]);
  assert.equal(controller.isStopBlocked, false);
});

test("PTZ automatic stop retries are bounded and manual recovery remains available", async (t) => {
  const { controller, timers, calls } = ptzFixture(t, 3);
  await controller.startMove("camera", { pan: 0.5 });
  await controller.stop("pointer_release");
  for (let attempt = 0; attempt < 2; attempt++) {
    const [id, timer] = [...timers][0];
    assert.equal(timer.delay, 300);
    timers.delete(id);
    timer.callback();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(timers.size, 0);
  assert.equal(controller.state.stopFailures, 3);
  assert.equal(controller.isStopBlocked, true);
  await controller.stop("blur");
  assert.deepEqual(calls, ["move", "stop", "stop", "stop", "stop"]);
  assert.equal(controller.isStopBlocked, false);
  assert.equal(controller.isMoving, false);
});
import {
  CAMERA_PRESETS,
  buildPresetRtspUrl,
} from "../src/shared/camera-presets.ts";

test("camera presets generate channel and stream conventions without credentials", () => {
  const build = (
    id,
    channel = "1",
    stream = "main",
    host = "camera.local",
    port = "",
  ) =>
    buildPresetRtspUrl(
      CAMERA_PRESETS.find((preset) => preset.id === id),
      host,
      port,
      channel,
      stream,
    );
  assert.equal(
    build("intelbras", "4", "sub"),
    "rtsp://camera.local:554/cam/realmonitor?channel=4&subtype=1",
  );
  assert.equal(
    build("hikvision", "12", "sub"),
    "rtsp://camera.local:554/Streaming/Channels/1202",
  );
  assert.equal(
    build("hanwha-nvr", "1"),
    "rtsp://camera.local:554/LiveChannel/0/media.smp",
  );
  assert.equal(build("luxvision-ip", "2"), "rtsp://camera.local:554/ch02/0");
  assert.equal(
    build("tapo", "1", "sub", "192.168.1.20", "8554"),
    "rtsp://192.168.1.20:8554/stream2",
  );
  assert.equal(
    build("mibo"),
    "rtsp://camera.local:554/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif",
  );
  assert.equal(
    build("tapo", "1", "main", "2001:db8::1"),
    "rtsp://[2001:db8::1]:554/stream1",
  );
  assert.equal(
    build("tapo", "1", "main", "[2001:db8::1]"),
    "rtsp://[2001:db8::1]:554/stream1",
  );
  for (const host of [
    "",
    "user:secret@camera",
    "camera/path",
    "camera?x=1",
    "rtsp://camera",
    "camera:554",
    "bad host",
    "camera#fragment",
    "camera\\path",
  ]) {
    assert.equal(build("intelbras", "1", "main", host), null, host);
  }
  for (const port of ["0", "65536", "1.5", "no-port"]) {
    assert.equal(build("tapo", "1", "main", "camera", port), null);
  }
  for (const channel of ["", "0", "-1", "1.5", "1000"]) {
    assert.equal(build("intelbras", channel), null);
  }
  assert.equal(build("yoosee", "1", "sub"), null);
  for (const preset of CAMERA_PRESETS) {
    const url = new URL(build(preset.id));
    assert.equal(url.username, "");
    assert.equal(url.password, "");
    assert.equal(url.href.includes("{"), false);
  }
});
import { mkdtemp, mkdir, readFile, readdir, rm, statfs, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { DatabaseSupervisor } from "../src/main/supervisors/database.ts";
import { MediaSession } from "../src/main/supervisors/media-session.ts";
import {
  checkStorageStatus,
  shouldAllowWrite,
} from "../src/main/services/storage-monitor.ts";
import {
  FfmpegRunner,
  assertConfinedOutputPath,
} from "../src/workers/media/ffmpeg-runner.ts";
import {
  fetchSnapshot,
  MAX_SNAPSHOT_BYTES,
} from "../src/main/services/snapshot.ts";
import { captureSnapshot } from "../src/main/services/snapshot-capture.ts";
import { probeRtsp } from "../src/workers/camera/probes.ts";
import { buildCameraSlots } from "../src/renderer/camera-layout.ts";
import { recordingFileResponse } from "../src/main/services/recording-stream.ts";
import { ShutdownCoordinator } from "../src/main/supervisors/shutdown.ts";
import { sanitizeSidecarOutput } from "../src/main/logging/sanitizer.ts";
import { createHash } from "node:crypto";
import { sha256OfPath } from "../src/workers/media/mediamtx-config.ts";
import {
  loadHardwareAcceleration,
  saveHardwareAcceleration,
} from "../src/main/services/hardware-acceleration.ts";
import { parseConfig } from "../src/shared/config.ts";
import { LocalAlertCenter } from "../src/main/services/alert-center.ts";
import { selectRetentionCandidates } from "../src/main/services/retention-policy.ts";
import { isScheduledAt, nextScheduledAt } from "../src/shared/recording-schedule.ts";
import { RecordingScheduler, shouldScheduleRecording } from "../src/main/services/recording-scheduler.ts";
import { MotionPrebufferService } from "../src/main/services/motion-prebuffer.ts";
import {
  deleteRecordingPreview,
  MAX_RECORDING_PREVIEW_BYTES,
  readRecordingPreview,
  saveRecordingPreview,
} from "../src/main/services/recording-preview.ts";
import {
  MAX_SYNCHRONIZED_CAMERAS,
  normalizeSynchronizedOffset,
  segmentAt,
} from "../src/renderer/sync-playback.ts";
import {
  buildConcatManifest,
  ClipExportService,
  planClipExport,
} from "../src/main/services/clip-export.ts";

test("hardware preference defaults to automatic and persists opt-out across starts", async (t) => {
  const directory = await temporaryDirectory(t);
  assert.equal(loadHardwareAcceleration(directory), true);
  await saveHardwareAcceleration(directory, false);
  assert.equal(loadHardwareAcceleration(directory), false);
  await saveHardwareAcceleration(directory, true);
  assert.equal(loadHardwareAcceleration(directory), true);
  await writeFile(join(directory, "hardware-acceleration.json"), "broken");
  assert.equal(loadHardwareAcceleration(directory), true);
  await writeFile(
    join(directory, "hardware-acceleration.json"),
    '{"enabled":"false"}',
  );
  assert.equal(loadHardwareAcceleration(directory), true);
  assert.deepEqual(await readdir(directory), ["hardware-acceleration.json"]);
});

test("legacy configuration gains disabled retention defaults", () => {
  const config = parseConfig(JSON.stringify({
    theme: "dark", snapshotDir: "", recordingsDir: "",
    reconnect: { initialDelayMs: 1000, maxDelayMs: 60000, maxAttempts: 10 },
    streams: { behavior: "sub-first", maxTranscodes: 2, enableHardwareAcceleration: true },
    log: { level: "info", maxBytes: 4194304, maxFiles: 5 },
  }));
  assert.deepEqual(config.retention, { enabled: false, maxAgeDays: 0, maxBytes: 0 });
});

test("local alert centre groups repeated camera failures", () => {
  const alerts = new LocalAlertCenter();
  alerts.report("camera_disconnected", "Câmera desconectada.", "camera-one");
  alerts.report("camera_disconnected", "Câmera desconectada.", "camera-one");
  alerts.report("storage_low", "Espaço insuficiente.");
  assert.equal(alerts.list().length, 2);
  assert.equal(alerts.list().find((alert) => alert.cameraId === "camera-one")?.count, 2);
  assert.equal(alerts.dismiss("camera_disconnected:camera-one"), true);
});

test("diagnostic report sanitizes alert messages", () => {
  const alerts = new LocalAlertCenter();
  alerts.report("recording_interrupted", "RTSP rtsp://alice:secret@camera.local/live token=top-secret", "camera-one");
  const report = JSON.stringify(alerts.diagnosticReport());
  assert.equal(report.includes("secret"), false);
  assert.equal(report.includes("alice"), false);
  assert.match(report, /\[REDACTED\]/);
});

test("retention policy preserves protected and active media", () => {
  const selected = selectRetentionCandidates([
    { id: "protected", timestamp: 1, bytes: 50, protected: true, active: false },
    { id: "active", timestamp: 2, bytes: 50, protected: false, active: true },
    { id: "old", timestamp: 3, bytes: 50, protected: false, active: false },
  ], { now: 1000, maxAgeDays: 0, maxBytes: 100 });
  assert.deepEqual(selected, ["old"]);
});

test("resource policy uses substream in grid, main in fullscreen, and preserves recording", () => {
  assert.deepEqual(
    decideResourceState({ context: "grid", layoutSize: 4, windowMinimized: false, recording: false }),
    { profile: "sub", active: true, reason: "Grid usa substream por padrão." },
  );
  assert.deepEqual(
    decideResourceState({ context: "fullscreen", layoutSize: 1, windowMinimized: false, recording: false }),
    { profile: "main", active: true, reason: "Fullscreen usa main stream." },
  );
  assert.deepEqual(
    decideResourceState({ context: "hidden", layoutSize: 4, windowMinimized: false, recording: true }),
    { profile: "sub", active: true, reason: "Item invisível; gravação preservada." },
  );
  assert.equal(
    decideResourceState({ context: "hidden", layoutSize: 4, windowMinimized: false, recording: false }).active,
    false,
  );
});

test("motion subscription registry cancels the camera subscription", async () => {
  let unsubscribed = false;
  const registry = new MotionSubscriptionRegistry({
    getClient: async () => ({
      subscribe: async () => ({ renewAfterMs: 60_000 }),
      renew: async () => ({ renewAfterMs: 60_000 }),
      unsubscribe: async () => { unsubscribed = true; },
    }),
  });
  assert.equal(await registry.start("camera-one"), true);
  await registry.stop("camera-one");
  assert.equal(unsubscribed, true);
});

test("unsupported cameras do not create or retry a motion subscription", async (t) => {
  let attempts = 0;
  const registry = new MotionSubscriptionRegistry({ getClient: async (cameraId) => {
    attempts += 1;
    if (cameraId === "unsupported") return null;
    return {
      subscribe: async () => ({ renewAfterMs: 60_000 }),
      renew: async () => ({ renewAfterMs: 60_000 }),
      unsubscribe: async () => undefined,
      pull: async (signal) => new Promise((done) => signal.addEventListener("abort", () => done([]), { once: true })),
    };
  } }, undefined, 5);
  t.after(() => registry.stopAll());
  assert.equal(await registry.start("unsupported"), false);
  assert.equal(await registry.start("supported"), true);
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(attempts, 2);
});

test("lost PullPoint subscriptions reconnect and stop cancels later retries", async (t) => {
  let attempts = 0;
  let unsubscribed = 0;
  const registry = new MotionSubscriptionRegistry({
    getClient: async () => {
      const attempt = ++attempts;
      return {
        subscribe: async () => ({ renewAfterMs: 60_000 }),
        renew: async () => ({ renewAfterMs: 60_000 }),
        unsubscribe: async () => { unsubscribed += 1; },
        pull: async (signal) => attempt === 1
          ? Promise.reject(new Error("subscription lost"))
          : new Promise((done) => signal.addEventListener("abort", () => done([]), { once: true })),
      };
    },
  }, undefined, 10);
  t.after(() => registry.stopAll());
  assert.equal(await registry.start("camera-one"), true);
  const deadline = Date.now() + 500;
  while (attempts < 2 && Date.now() < deadline) await new Promise((done) => setTimeout(done, 5));
  assert.equal(attempts, 2);
  await registry.stop("camera-one");
  await new Promise((done) => setTimeout(done, 30));
  assert.equal(attempts, 2);
  assert.equal(unsubscribed, 2);
});

test("failed renewal reconnects and a removed camera cannot be resurrected", async (t) => {
  let attempts = 0;
  const registry = new MotionSubscriptionRegistry({
    getClient: async () => {
      attempts += 1;
      return {
        subscribe: async () => ({ renewAfterMs: 1 }),
        renew: async () => { throw new Error("renewal lost"); },
        unsubscribe: async () => undefined,
        pull: async (signal) => new Promise((done) => signal.addEventListener("abort", () => done([]), { once: true })),
      };
    },
  }, undefined, 50, 1);
  t.after(() => registry.stopAll());
  assert.equal(await registry.start("camera-one"), true);
  await new Promise((done) => setTimeout(done, 10));
  await registry.stop("camera-one");
  await new Promise((done) => setTimeout(done, 70));
  assert.equal(attempts, 1);
});

test("deactivation during a pending subscription prevents late polling", async (t) => {
  let finishSubscribe;
  let polls = 0;
  const registry = new MotionSubscriptionRegistry({
    getClient: async () => ({
      subscribe: async () => new Promise((done) => { finishSubscribe = done; }),
      renew: async () => ({ renewAfterMs: 60_000 }),
      unsubscribe: async () => undefined,
      pull: async () => { polls += 1; return []; },
    }),
  }, undefined, 5);
  t.after(() => registry.stopAll());
  const starting = registry.start("camera-one");
  while (!finishSubscribe) await new Promise((done) => setImmediate(done));
  await registry.stop("camera-one");
  finishSubscribe({ renewAfterMs: 60_000 });
  assert.equal(await starting, false);
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(polls, 0);
});

test("reactivation can start a new subscription while the old attempt settles", async (t) => {
  let finishOld;
  let attempts = 0;
  const registry = new MotionSubscriptionRegistry({
    getClient: async () => {
      const attempt = ++attempts;
      return {
        subscribe: async () => attempt === 1
          ? new Promise((done) => { finishOld = done; })
          : { renewAfterMs: 60_000 },
        renew: async () => ({ renewAfterMs: 60_000 }),
        unsubscribe: async () => undefined,
        pull: async (signal) => new Promise((done) => signal.addEventListener("abort", () => done([]), { once: true })),
      };
    },
  });
  t.after(() => registry.stopAll());
  const first = registry.start("camera-one");
  while (!finishOld) await new Promise((done) => setImmediate(done));
  await registry.stop("camera-one");
  assert.equal(await registry.start("camera-one"), true);
  finishOld({ renewAfterMs: 60_000 });
  assert.equal(await first, false);
  assert.equal(attempts, 2);
});

test("motion events deduplicate repeated states and bound camera clock skew", () => {
  const normalizer = new MotionEventNormalizer();
  const receivedAt = "2026-01-01T12:00:00.000Z";
  assert.equal(normalizer.normalize({ cameraId: "camera-one", active: true, occurredAt: receivedAt, receivedAt })?.state, "started");
  assert.equal(normalizer.normalize({ cameraId: "camera-one", active: true, occurredAt: receivedAt, receivedAt }), null);
  assert.equal(normalizer.normalize({ cameraId: "camera-one", active: false, occurredAt: "2025-01-01T00:00:00.000Z", receivedAt })?.occurredAt, receivedAt);
  assert.equal(normalizer.normalize({ cameraId: "camera-one", active: false, occurredAt: receivedAt, receivedAt }), null);
  const later = "2026-01-01T12:00:02.000Z";
  assert.equal(normalizer.normalize({ cameraId: "camera-one", active: true, receivedAt: later })?.repeated, false);
  assert.equal(normalizer.normalize({ cameraId: "camera-one", active: true, receivedAt: "2026-01-01T12:00:04.000Z" })?.repeated, true);
});

test("motion notification parser accepts explicit motion states only", () => {
  assert.deepEqual(parseOnvifMotionNotification('<Topic>tns1:RuleEngine/Motion</Topic><SimpleItem Name="IsMotion" Value="true"/>'), { active: true, occurredAt: null });
  assert.equal(parseOnvifMotionNotification('<Topic>tns1:Device/Trigger</Topic><SimpleItem Value="true"/>'), null);
  const messages = '<NotificationMessage><Topic>tns1:RuleEngine/Motion</Topic><SimpleItem Value="true"/></NotificationMessage>'
    + '<NotificationMessage><Topic>tns1:RuleEngine/Motion</Topic><SimpleItem Value="false"/></NotificationMessage>';
  assert.deepEqual(parseOnvifMotionNotifications(messages).map((event) => event.active), [true, false]);
});

test("motion timeout bounds a missing end event and can be cancelled", () => {
  const pending = new Map();
  const fired = [];
  let nextId = 0;
  const clock = {
    setTimeout: (callback, delay) => { const id = ++nextId; pending.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => pending.delete(id),
  };
  const timers = new MotionRecordingTimers((cameraId, reason) => fired.push([cameraId, reason]), clock);
  timers.arm("camera-one", "missing-end", MOTION_MISSING_END_TIMEOUT_MS);
  assert.equal([...pending.values()][0].delay, 600_000);
  const [id, timer] = [...pending][0];
  pending.delete(id);
  timer.callback();
  assert.deepEqual(fired, [["camera-one", "missing-end"]]);
  timers.arm("camera-one", "post-event", 30_000);
  timers.clear("camera-one");
  assert.equal(pending.size, 0);
});

test("reordering a live layout does not alter recording state", () => {
  const cameras = [
    { id: "camera-a", active: true, recordingStatus: "recording" },
    { id: "camera-b", active: true, recordingStatus: "idle" },
  ];
  const slots = buildCameraSlots(cameras, ["camera-b", "camera-a"], 2);
  assert.deepEqual(slots.slice(0, 2).map((camera) => camera?.id), ["camera-b", "camera-a"]);
  assert.equal(cameras[0].recordingStatus, "recording");
});

test("weekly schedule supports intervals crossing midnight", () => {
  const periods = [{ weekday: 1, start: "22:00", end: "02:00", enabled: true }];
  assert.equal(isScheduledAt(periods, new Date(2026, 0, 5, 23, 0)), true);
  assert.equal(isScheduledAt(periods, new Date(2026, 0, 6, 1, 0)), true);
  assert.equal(isScheduledAt(periods, new Date(2026, 0, 6, 3, 0)), false);
});

test("weekly schedule reports the next configured start", () => {
  const periods = [{ weekday: 2, start: "08:30", end: "09:00", enabled: true }];
  const next = nextScheduledAt(periods, new Date(2026, 0, 5, 12, 0));
  assert.equal(next?.getDay(), 2);
  assert.equal(next?.getHours(), 8);
  assert.equal(next?.getMinutes(), 30);
});

test("next schedule preserves minute boundaries, overnight periods, and disabled days", () => {
  const monday = new Date(2026, 0, 5, 22, 30, 45);
  const periods = [{ weekday: 1, start: "22:00", end: "02:00", enabled: true }];
  assert.equal(nextScheduledAt(periods, monday)?.getTime(), new Date(2026, 0, 5, 22, 31).getTime());
  assert.equal(monday.getSeconds(), 45);
  assert.equal(nextScheduledAt(periods, new Date(2026, 0, 5, 23, 59))?.getTime(), new Date(2026, 0, 6).getTime());
  assert.equal(nextScheduledAt(periods, new Date(2026, 0, 6, 1, 59))?.getTime(), new Date(2026, 0, 12, 22).getTime());
  assert.equal(nextScheduledAt([], monday), null);
  assert.equal(nextScheduledAt([{ ...periods[0], enabled: false }], monday), null);
  assert.equal(nextScheduledAt(periods, new Date(NaN)), null);
});

test("next schedule agrees with minute-by-minute lookup across weekly and DST boundaries", () => {
  const periodSets = [
    [{ weekday: 0, start: "02:30", end: "03:30", enabled: true }],
    [{ weekday: 6, start: "23:00", end: "01:30", enabled: true }],
    [
      { weekday: 0, start: "01:00", end: "01:45", enabled: true },
      { weekday: 1, start: "08:00", end: "09:00", enabled: false },
      { weekday: 2, start: "06:00", end: "08:00", enabled: true },
    ],
  ];
  for (const from of [
    new Date(2026, 2, 7, 23, 59, 30),
    new Date(2026, 2, 8, 1, 59),
    new Date(2026, 9, 31, 23, 59),
    new Date(2026, 10, 1, 1, 59),
    new Date(2026, 11, 31, 23, 59),
  ]) {
    for (const periods of periodSets) {
      const cursor = new Date(from);
      cursor.setSeconds(0, 0);
      cursor.setMinutes(cursor.getMinutes() + 1);
      let expected = null;
      for (let minute = 0; minute < 8 * 24 * 60; minute++) {
        if (isScheduledAt(periods, cursor)) { expected = new Date(cursor); break; }
        cursor.setMinutes(cursor.getMinutes() + 1);
      }
      assert.deepEqual(nextScheduledAt(periods, from), expected);
    }
  }
});

test("scheduler never overrides a manual recording", () => {
  const periods = [{ weekday: 1, start: "08:00", end: "10:00", enabled: true }];
  assert.equal(shouldScheduleRecording({ periods, now: new Date(2026, 0, 5, 9), cameraActive: true, manualRecording: true, scheduledRecording: false }), "none");
  assert.equal(shouldScheduleRecording({ periods, now: new Date(2026, 0, 5, 9), cameraActive: true, manualRecording: false, scheduledRecording: false }), "start");
});

test("recording scheduler starts only one recurring loop", async () => {
  let calls = 0;
  const scheduler = new RecordingScheduler(async () => { calls += 1; }, 60_000);
  scheduler.start();
  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  scheduler.stop();
});

test("synchronized playback identifies gaps and bounds per-camera clock compensation", () => {
  const segments = [
    { id: "segment-1", recordingId: "123e4567-e89b-42d3-a456-426614174000", path: "a.mp4", startedAt: "2026-01-01T10:00:00.000Z", endedAt: "2026-01-01T10:01:00.000Z", durationMs: 60_000, status: "completed" },
    { id: "segment-2", recordingId: "123e4567-e89b-42d3-a456-426614174000", path: "b.mp4", startedAt: "2026-01-01T10:02:00.000Z", endedAt: "2026-01-01T10:03:00.000Z", durationMs: 60_000, status: "completed" },
  ];
  assert.deepEqual(segmentAt(segments, Date.parse("2026-01-01T10:00:30.000Z")), { index: 0, offsetSeconds: 30 });
  assert.deepEqual(segmentAt(segments, Date.parse("2026-01-01T10:02:10.000Z")), { index: 1, offsetSeconds: 10 });
  assert.equal(segmentAt(segments, Date.parse("2026-01-01T10:01:30.000Z")), null);
  assert.equal(normalizeSynchronizedOffset(67_600), 60_000);
  assert.equal(normalizeSynchronizedOffset(-67_600), -60_000);
  assert.equal(normalizeSynchronizedOffset(Number.NaN), 0);
  assert.equal(MAX_SYNCHRONIZED_CAMERAS, 4);
});

test("recording scheduler reconciles changes requested during an active pass", async () => {
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const scheduler = new RecordingScheduler(async () => {
    calls += 1;
    if (calls === 1) {
      entered();
      await blocked;
    }
  });
  const first = scheduler.refresh();
  await started;
  const updates = [scheduler.refresh(), scheduler.refresh()];
  assert.equal(calls, 1);
  release();
  await Promise.all([first, ...updates]);
  assert.equal(calls, 2);
});

test("recording scheduler reports background failures and can retry", async (t) => {
  const failure = new Error("reconciliation failed");
  const errors = [];
  let calls = 0;
  const scheduler = new RecordingScheduler(async () => {
    calls += 1;
    if (calls === 1) throw failure;
  }, 60_000, (error) => errors.push(error));
  t.after(() => scheduler.stop());
  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [failure]);
  await scheduler.refresh();
  assert.equal(calls, 2);
});

test("recording scheduler releases its pending pass after synchronous failures", async () => {
  let calls = 0;
  const scheduler = new RecordingScheduler(() => {
    calls += 1;
    if (calls === 1) throw new Error("synchronous failure");
    return Promise.resolve();
  });
  await assert.rejects(scheduler.refresh(), /synchronous failure/);
  await scheduler.refresh();
  assert.equal(calls, 2);
});

test("recording scheduler stop discards a queued background pass", async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const scheduler = new RecordingScheduler(async () => { calls += 1; await blocked; }, 60_000);
  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));
  const refresh = scheduler.refresh();
  scheduler.stop();
  release();
  await refresh;
  assert.equal(calls, 1);
});

test("recording previews validate content and size and release the file after failures", async (t) => {
  const root = await temporaryDirectory(t);
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const path = join(root, `${id}.jpg`);
  assert.equal(await readRecordingPreview(root, id), null);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  await saveRecordingPreview(root, id, jpeg);
  assert.equal(await readRecordingPreview(root, id), `data:image/jpeg;base64,${jpeg.toString("base64")}`);
  await writeFile(path, "invalid");
  await assert.rejects(readRecordingPreview(root, id), /JPEG/);
  const oversized = Buffer.alloc(MAX_RECORDING_PREVIEW_BYTES + 1);
  jpeg.copy(oversized);
  await writeFile(path, oversized);
  await assert.rejects(readRecordingPreview(root, id), /limite/);
  await saveRecordingPreview(root, id, oversized.subarray(0, MAX_RECORDING_PREVIEW_BYTES));
  assert.equal(await readRecordingPreview(root, id), `data:image/jpeg;base64,${oversized.subarray(0, MAX_RECORDING_PREVIEW_BYTES).toString("base64")}`);
  await deleteRecordingPreview(root, id);
  assert.equal(await readRecordingPreview(root, id), null);
  await assert.rejects(readRecordingPreview(root, "../outside"), /inválido/);
});

test("streamed executable hashing matches SHA-256 across chunk boundaries", async (t) => {
  const directory = await temporaryDirectory(t);
  const binary = join(directory, "fake.exe");
  const contents = Buffer.alloc(256 * 1024 + 17, 0xa5);
  await writeFile(binary, contents);
  assert.equal(
    await sha256OfPath(binary),
    createHash("sha256").update(contents).digest("hex"),
  );
  await assert.rejects(sha256OfPath(join(directory, "missing.exe")));
});

test("media startup refuses a changed executable on every start", async (t) => {
  const directory = await temporaryDirectory(t);
  const binary = join(directory, "fake.exe");
  await writeFile(binary, "original");
  const expectedHash = await sha256OfPath(binary);
  let spawned = 0;
  const options = {
    cameraId: "camera",
    rtspUrl: "rtsp://camera/live",
    path: "camera",
    binaryPath: binary,
    expectedHash,
    configDir: directory,
    processFactory: {
      spawn() {
        spawned++;
        return { pid: 1, kill() {}, onExit() {} };
      },
    },
  };
  const first = new MediaSession(options);
  t.after(() => first.stop());
  assert.equal((await first.start()).state, "running");
  await first.stop();
  await writeFile(binary, "tampered");
  const second = new MediaSession(options);
  t.after(() => second.stop());
  assert.equal((await second.start()).state, "crashed");
  assert.equal(spawned, 1);
});

test("sidecar sanitization redacts injected secrets and preserves diagnostic context", () => {
  const output = sanitizeSidecarOutput(
    'camera failed password="canary-pass-xyz" token="canary-token-123" rtsp://canary-user:canary-url-pass@camera.local/live',
  );
  for (const secret of [
    "canary-pass-xyz",
    "canary-token-123",
    "canary-user",
    "canary-url-pass",
  ]) {
    assert.equal(output.includes(secret), false);
  }
  assert.match(output, /camera failed/);
  assert.match(output, /camera\.local\/live/);
});

test("shutdown timeout does not start duplicate cleanup operations", async () => {
  const coordinator = new ShutdownCoordinator();
  let calls = 0;
  let finish;
  coordinator.register({
    name: "slow",
    stop: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const result = await coordinator.shutdown(10);
  assert.equal(calls, 1);
  assert.deepEqual(result, []);
  finish();
  await Promise.resolve();
  assert.deepEqual(result, []);
});

async function temporaryDirectory(t) {
  const root = tmpdir();
  const directory = await mkdtemp(join(root, "dvr-regression-"));
  t.after(async () => {
    const child = relative(root, directory);
    assert.ok(child && !child.startsWith("..") && !isAbsolute(child));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("motion prebuffer preserves only the requested interval and clears cache on stop", async (t) => {
  const root = await temporaryDirectory(t);
  const cameraId = "11111111-1111-4111-8111-111111111111";
  const recordingId = "22222222-2222-4222-8222-222222222222";
  const cacheRoot = join(root, "cache");
  const libraryRoot = join(root, "library");
  const calls = [];
  const media = {
    acquire: async (...args) => { calls.push(["acquire", ...args]); return { state: "running" }; },
    setRecording: async (...args) => { calls.push(["record", ...args]); return true; },
    release: async (...args) => { calls.push(["release", ...args]); },
  };
  const service = new MotionPrebufferService(media, cacheRoot, libraryRoot);
  t.after(() => service.stopAll());
  assert.equal(await service.start(cameraId, "rtsp://camera.local/main", 15), true);
  assert.equal(calls[0][6], 2_000);
  const cacheDir = join(cacheRoot, `camera_${cameraId.replaceAll("-", "")}_prebuffer`);
  await mkdir(cacheDir, { recursive: true });
  const oldFile = join(cacheDir, "old.mp4");
  const recentFile = join(cacheDir, "recent.mp4");
  await writeFile(oldFile, "old segment");
  await writeFile(recentFile, "recent segment");
  const now = Date.now();
  await utimes(oldFile, new Date(now - 40_000), new Date(now - 40_000));
  await utimes(recentFile, new Date(now - 10_000), new Date(now - 10_000));
  const segments = await service.capture(cameraId, recordingId, new Date(now).toISOString());
  assert.equal(segments.length, 1);
  assert.equal(await readFile(segments[0].path, "utf8"), "recent segment");
  assert.ok(segments[0].path.startsWith(join(libraryRoot, "motion-prebuffer", recordingId)));
  assert.deepEqual(calls.filter((call) => call[0] === "record").map((call) => call[2]), [true, false, true]);
  await service.stop(cameraId);
  assert.deepEqual(await readdir(cacheDir), []);
});

function databaseTransport() {
  const requests = [];
  return {
    requests,
    postMessage: (request) => requests.push(request),
    onMessage(callback) {
      this.reply = callback;
    },
    onExit(callback) {
      this.exit = callback;
    },
    kill() {
      this.exit(0);
    },
  };
}

test(
  "database exit settles pending and future requests immediately",
  { timeout: 1000 },
  async () => {
    const transport = databaseTransport();
    const database = new DatabaseSupervisor(transport);
    const pending = database.request("camera.list", undefined);
    transport.exit(1);
    assert.equal((await pending).ok, false);
    assert.equal((await database.request("health")).ok, false);
    assert.equal(transport.requests.length, 1);
  },
);

test(
  "database close settles other pending requests",
  { timeout: 1000 },
  async () => {
    const transport = databaseTransport();
    const database = new DatabaseSupervisor(transport);
    const pending = database.request("camera.list", undefined);
    const closing = database.close();
    transport.reply({
      id: transport.requests.at(-1).id,
      ok: true,
      value: null,
    });
    await closing;
    assert.equal((await pending).ok, false);
  },
);

test("database transport exceptions retain the response contract", async () => {
  const transport = databaseTransport();
  transport.postMessage = () => {
    throw new Error("transport unavailable");
  };
  const database = new DatabaseSupervisor(transport);
  assert.equal((await database.request("health")).ok, false);
});

test("disk probe reports real capacity for paths containing apostrophes", async (t) => {
  const directory = await temporaryDirectory(t);
  const path = join(directory, "camera's recordings");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path);
  const status = await checkStorageStatus(path, { minFreeBytes: 0 });
  const disk = await statfs(path);
  assert.equal(status.totalBytes, disk.blocks * disk.bsize);
  assert.ok(status.freeBytes > 0);
  assert.ok(status.freeBytes <= status.totalBytes);
  assert.equal(shouldAllowWrite(status), true);
});

test("storage monitor rejects full, inaccessible, and missing destinations", async () => {
  const full = await checkStorageStatus("full", {
    minFreeBytes: 256,
    probe: {
      stat: async () => ({ isDirectory: () => true, size: 0 }),
      access: async () => undefined,
      diskFree: async () => ({ free: 255, total: 1000 }),
    },
  });
  assert.equal(full.lowSpace, true);
  assert.equal(shouldAllowWrite(full), false);
  const inaccessible = await checkStorageStatus("locked", {
    probe: {
      stat: async () => ({ isDirectory: () => true, size: 0 }),
      access: async () => { throw new Error("denied"); },
      diskFree: async () => ({ free: 1000, total: 1000 }),
    },
  });
  assert.equal(inaccessible.writable, false);
  assert.equal(shouldAllowWrite(inaccessible), false);
  const missing = await checkStorageStatus("missing", {
    probe: {
      stat: async () => { throw new Error("missing"); },
      access: async () => undefined,
      diskFree: async () => { throw new Error("removed"); },
    },
  });
  assert.equal(missing.exists, false);
  assert.equal(shouldAllowWrite(missing), false);
});

test("FFmpeg missing executable rejects without leaking active processes", async (t) => {
  const directory = await temporaryDirectory(t);
  const runner = new FfmpegRunner(join(directory, "missing.exe"));
  await assert.rejects(
    runner.run({
      args: [join(directory, "frame.jpg")],
      allowedOutputDirs: [directory],
    }),
    { code: "EXIT" },
  );
  assert.equal(runner.activeCount, 0);
});

test("FFmpeg confines Windows absolute and relative output paths", async (t) => {
  const directory = await temporaryDirectory(t);
  assert.throws(
    () =>
      assertConfinedOutputPath(join(directory, "..", "escape.jpg"), [
        directory,
      ]),
    { code: "CONFINED" },
  );
  const runner = new FfmpegRunner(process.execPath);
  await assert.rejects(
    runner.run({
      args: [join(directory, "..", "escape.jpg")],
      allowedOutputDirs: [directory],
    }),
    { code: "CONFINED" },
  );
  await assert.rejects(
    runner.run({ args: ["relative.jpg"], allowedOutputDirs: [directory] }),
    { code: "CONFINED" },
  );
});

test("FFmpeg runner passes literal arguments and bounds captured output", async (t) => {
  const directory = await temporaryDirectory(t);
  const fixture = join(directory, "output.mjs");
  await writeFile(
    fixture,
    "if (process.argv[2] !== 'rtsp://camera/path?a=1&b=2') process.exit(2); process.stdout.write('x'.repeat(100000));",
  );
  const runner = new FfmpegRunner(process.execPath);
  const result = await runner.run({
    args: [fixture, "rtsp://camera/path?a=1&b=2", join(directory, "frame.jpg")],
    allowedOutputDirs: [directory],
    maxOutputBytes: 1000,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(Buffer.byteLength(result.output), 1000);
  assert.equal(runner.activeCount, 0);
});

test("FFmpeg timeout terminates and unregisters the process", async (t) => {
  const directory = await temporaryDirectory(t);
  const fixture = join(directory, "wait.mjs");
  await writeFile(fixture, "setInterval(() => {}, 1000)");
  const runner = new FfmpegRunner(process.execPath);
  await assert.rejects(
    runner.run({
      args: [fixture],
      allowedOutputDirs: [directory],
      timeoutMs: 100,
      killGraceMs: 50,
    }),
    { code: "TIMEOUT" },
  );
  assert.equal(runner.activeCount, 0);
});

test("clip export plans segment boundaries and reports gaps without loading media", () => {
  const plan = planClipExport({
    recordingId: "recording",
    destinationPath: "C:/exports/clip.mp4",
    startAt: "2026-01-10T08:01:00.000Z",
    endAt: "2026-01-10T08:14:00.000Z",
    segments: [
      {
        id: "one",
        recordingId: "recording",
        path: "one.m4s",
        absolutePath: "C:/library/one.m4s",
        startedAt: "2026-01-10T08:00:00.000Z",
        endedAt: "2026-01-10T08:05:00.000Z",
        durationMs: 300000,
        status: "completed",
      },
      {
        id: "two",
        recordingId: "recording",
        path: "two.m4s",
        absolutePath: "C:/library/two.m4s",
        startedAt: "2026-01-10T08:12:00.000Z",
        endedAt: "2026-01-10T08:17:00.000Z",
        durationMs: 300000,
        status: "completed",
      },
    ],
  });
  assert.equal(plan.durationMs, 780000);
  assert.deepEqual(plan.gaps, [
    { startsAt: "2026-01-10T08:05:00.000Z", endsAt: "2026-01-10T08:12:00.000Z" },
  ]);
  assert.match(buildConcatManifest(plan.segments), /inpoint 60\.000/);
  assert.match(buildConcatManifest(plan.segments), /outpoint 120\.000/);
  assert.throws(
    () => planClipExport({
      recordingId: "recording",
      destinationPath: "C:/exports/clip.mp4",
      startAt: "2026-01-10T08:00:00.000Z",
      endAt: "2026-01-10T10:01:00.000Z",
      segments: [],
    }),
    /duração máxima/,
  );
});

test("clip export serializes work, reports progress, and cleans temporary files", async (t) => {
  const directory = await temporaryDirectory(t);
  const temporaryRoot = join(directory, "temporary");
  const destination = join(directory, "clip.mp4");
  let release;
  let runnerReady;
  let exportArgs;
  const ready = new Promise((resolveReady) => { runnerReady = resolveReady; });
  const executor = {
    run: ({ args, onProgress }) =>
      new Promise((resolveRun) => {
        exportArgs = args;
        runnerReady();
        release = async () => {
          onProgress(30_000);
          await writeFile(args.at(-1), "exported-media");
          resolveRun({ exitCode: 0, killed: false, timedOut: false, output: "", durationMs: 1 });
        };
      }),
  };
  const service = new ClipExportService(executor, "fake-ffmpeg", temporaryRoot);
  const input = {
    recordingId: "recording",
    jobId: "job-one",
    destinationPath: destination,
    startAt: "2026-01-10T08:00:00.000Z",
    endAt: "2026-01-10T08:01:00.000Z",
    segments: [{
      id: "segment",
      recordingId: "recording",
      path: "source.m4s",
      absolutePath: join(directory, "source.m4s"),
      startedAt: "2026-01-10T08:00:00.000Z",
      endedAt: "2026-01-10T08:01:00.000Z",
      durationMs: 60_000,
      status: "completed",
    }],
  };
  const exporting = service.export(input);
  assert.deepEqual(service.status("job-one"), { active: true, percent: 0 });
  await assert.rejects(service.export({ ...input, jobId: "job-two", destinationPath: join(directory, "second.mp4") }), /Já existe/);
  await ready;
  assert.equal(exportArgs.includes("0:a:0?"), true, "Clip export must preserve an optional audio stream");
  await release();
  const result = await exporting;
  assert.equal(result.destinationPath, destination);
  assert.deepEqual(service.status("job-one"), { active: false, percent: 0 });
  assert.equal((await readdir(temporaryRoot)).length, 0);
  assert.equal(await readFile(destination, "utf8"), "exported-media");
});

test("clip export cancellation removes its temporary manifest", async (t) => {
  const directory = await temporaryDirectory(t);
  const temporaryRoot = join(directory, "temporary");
  let runnerReady;
  const ready = new Promise((resolveReady) => { runnerReady = resolveReady; });
  const executor = {
    run: ({ signal }) => new Promise((_resolveRun, reject) => {
      runnerReady();
      signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    }),
  };
  const service = new ClipExportService(executor, "fake-ffmpeg", temporaryRoot);
  const exporting = service.export({
    recordingId: "recording",
    jobId: "cancel-me",
    destinationPath: join(directory, "clip.mp4"),
    startAt: "2026-01-10T08:00:00.000Z",
    endAt: "2026-01-10T08:01:00.000Z",
    segments: [{
      id: "segment",
      recordingId: "recording",
      path: "source.m4s",
      absolutePath: join(directory, "source.m4s"),
      startedAt: "2026-01-10T08:00:00.000Z",
      endedAt: "2026-01-10T08:01:00.000Z",
      durationMs: 60_000,
      status: "completed",
    }],
  });
  await ready;
  assert.equal(service.cancel("cancel-me"), true);
  await assert.rejects(exporting, /cancelled/);
  assert.equal((await readdir(temporaryRoot)).length, 0);
  assert.equal(service.activeJobId, null);
});

test("bundled FFmpeg exports a valid MP4 clip", async (t) => {
  if (process.platform !== "win32") {
    t.skip("O binário empacotado desta aplicação é destinado ao Windows.");
    return;
  }
  const directory = await temporaryDirectory(t);
  const binary = join(process.cwd(), "resources", "ffmpeg", "win32", "ffmpeg.exe");
  const source = join(directory, "source.mp4");
  const destination = join(directory, "exported.mp4");
  const extractedAudio = join(directory, "exported-audio.m4a");
  const runner = new FfmpegRunner(binary);
  const generated = await runner.run({
    binaryPath: binary,
    args: [
      "-hide_banner", "-nostdin", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=10",
      "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
      "-t", "1", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", "-y", source,
    ],
    allowedOutputDirs: [directory],
    timeoutMs: 10_000,
  });
  assert.equal(generated.exitCode, 0);
  const service = new ClipExportService(runner, binary, join(directory, "temporary"));
  const result = await service.export({
    recordingId: "recording",
    jobId: "31c059a2-7b50-47a8-abd3-303b75d1be98",
    destinationPath: destination,
    startAt: "2026-01-10T08:00:00.000Z",
    endAt: "2026-01-10T08:00:01.000Z",
    segments: [{
      id: "segment",
      recordingId: "recording",
      path: "source.mp4",
      absolutePath: source,
      startedAt: "2026-01-10T08:00:00.000Z",
      endedAt: "2026-01-10T08:00:01.000Z",
      durationMs: 1_000,
      status: "completed",
    }],
  });
  assert.equal(result.gaps.length, 0);
  const header = await readFile(destination);
  assert.equal(header.subarray(4, 8).toString("ascii"), "ftyp");
  const extracted = await runner.run({
    binaryPath: binary,
    args: ["-hide_banner", "-nostdin", "-i", destination, "-map", "0:a:0", "-c", "copy", "-y", extractedAudio],
    allowedInputDirs: [directory],
    allowedOutputDirs: [directory],
    timeoutMs: 10_000,
  });
  assert.equal(extracted.exitCode, 0, "Exported clip must retain its audio stream");
  assert.equal((await readFile(extractedAudio)).subarray(4, 8).toString("ascii"), "ftyp");
});

test("stopping a starting media session never spawns a late process", async (t) => {
  const directory = await temporaryDirectory(t);
  const binary = join(directory, "fake.exe");
  await writeFile(binary, "fake");
  let spawnCalls = 0;
  const session = new MediaSession({
    cameraId: "camera",
    rtspUrl: "rtsp://camera/live",
    path: "camera",
    binaryPath: binary,
    expectedHash: "",
    configDir: directory,
    processFactory: {
      spawn: () => {
        spawnCalls++;
        return { pid: 1, kill() {}, onExit() {} };
      },
    },
  });
  const starting = session.start();
  await session.stop();
  assert.equal((await starting).state, "stopped");
  assert.equal(session.statusNow.state, "stopped");
  assert.equal(spawnCalls, 0);
  assert.deepEqual(await readdir(directory), ["fake.exe"]);
});

test(
  "snapshot response timeout covers a stalled body",
  { timeout: 2000 },
  async (t) => {
    const server = createHttpServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "image/jpeg" });
      response.write(Buffer.from([0xff, 0xd8, 0xff]));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    await assert.rejects(
      fetchSnapshot({
        url: `http://127.0.0.1:${server.address().port}/snapshot`,
        timeoutMs: 100,
      }),
    );
  },
);

test("oversized snapshots are rejected while streaming and cancel the body", async () => {
  let cancelled = false;
  const chunk = new Uint8Array(1024 * 1024);
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    fetchSnapshot({
      url: "http://camera/snapshot",
      fetchImpl: async () => ({ status: 200, ok: true, body }),
    }),
    { code: "TOO_LARGE" },
  );
  assert.equal(cancelled, true);
});

test("oversized Content-Length is rejected before consuming the body", async () => {
  await assert.rejects(
    fetchSnapshot({
      url: "http://camera/snapshot",
      fetchImpl: async () => ({
        status: 200,
        ok: true,
        headers: { "content-length": String(MAX_SNAPSHOT_BYTES + 1) },
        arrayBuffer: () => assert.fail("Body was read"),
      }),
    }),
    { code: "TOO_LARGE" },
  );
});

test("snapshot fallback removes temporary frames after failures", async (t) => {
  const directory = await temporaryDirectory(t);
  const failure = new Error("capture failed after writing a partial frame");
  let calls = 0;
  await assert.rejects(
    captureSnapshot({
      cameraId: "camera",
      libraryRoot: directory,
      outputDir: directory,
      rtspUrl: "rtsp://camera/live",
      ffmpegRunner: {
        run: async ({ args }) => {
          calls++;
          await writeFile(args.at(-1), "partial frame");
          throw failure;
        },
      },
    }),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
  assert.deepEqual(await readdir(directory), []);
});

async function rtspServer(t, handler) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    handler(socket);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  return `rtsp://127.0.0.1:${server.address().port}/live`;
}

test("RTSP probe accepts fragmented status and authentication headers", async (t) => {
  let requests = 0;
  const url = await rtspServer(t, (socket) =>
    socket.on("data", (data) => {
      requests++;
      if (requests === 1) {
        socket.write("RTSP/1.0 4");
        setTimeout(
          () =>
            socket.write(
              '01 Unauthorized\r\nWWW-Authenticate: Basic realm="camera"\r\nContent-Length: 0\r\n\r\n',
            ),
          10,
        );
      } else {
        assert.match(data.toString(), /CSeq: 2/);
        assert.match(data.toString(), /Authorization: Basic/);
        socket.write("RTSP/1.0 200 OK\r\nContent-Length: 0\r\n\r\n");
      }
    }),
  );
  assert.equal(
    await probeRtsp({
      url,
      username: "user",
      password: "pass",
      timeoutMs: 1000,
    }),
    "ok",
  );
  assert.equal(requests, 2);
});

test(
  "RTSP probe settles on cancellation and stalled responses",
  { timeout: 2000 },
  async (t) => {
    const url = await rtspServer(t, () => {});
    assert.equal(await probeRtsp({ url, timeoutMs: 50 }), "timeout");
    const controller = new AbortController();
    const pending = probeRtsp({
      url,
      signal: controller.signal,
      timeoutMs: 5000,
    });
    controller.abort();
    assert.equal(await pending, "timeout");
  },
);

test("camera grid preserves occupied late slots after camera removal", () => {
  const cameras = [
    { id: "a", active: true },
    { id: "b", active: true },
  ];
  const slots = buildCameraSlots(
    cameras,
    ["a", null, null, null, null, "b"],
    2,
  );
  assert.equal(slots.length, 6);
  assert.equal(slots[5].id, "b");
  assert.equal(slots.filter(Boolean).length, 2);
});

test("camera grid deduplicates saved IDs and places new cameras once", () => {
  const cameras = [
    { id: "a", active: true },
    { id: "b", active: true },
    { id: "c", active: false },
  ];
  const slots = buildCameraSlots(cameras, ["a", "a", "missing", "c"], 2);
  assert.deepEqual(
    slots.map((camera) => camera?.id ?? null),
    ["a", "b", null, null],
  );
});

test("recording playback streams full files and requested byte ranges", async (t) => {
  const directory = await temporaryDirectory(t);
  const path = join(directory, "recording.mp4");
  await writeFile(path, "0123456789");
  for (const [range, status, expected] of [
    [null, 200, "0123456789"],
    ["bytes=2-4", 206, "234"],
    ["bytes=-3", 206, "789"],
    ["bytes=8-", 206, "89"],
  ]) {
    const request = new Request("http://localhost/video", {
      headers: range ? { Range: range } : {},
    });
    const response = await recordingFileResponse(request, path);
    assert.equal(response.status, status);
    assert.equal(
      response.headers.get("content-length"),
      String(expected.length),
    );
    assert.equal(await response.text(), expected);
  }
});

test("recording playback rejects invalid ranges and serves HEAD without a body", async (t) => {
  const directory = await temporaryDirectory(t);
  const path = join(directory, "recording.mp4");
  await writeFile(path, "0123456789");
  for (const range of ["bytes=10-", "bytes=4-2", "bytes=-0", "bytes=0-1,4-5"]) {
    const response = await recordingFileResponse(
      new Request("http://localhost/video", { headers: { Range: range } }),
      path,
    );
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */10");
  }
  const response = await recordingFileResponse(
    new Request("http://localhost/video", { method: "HEAD" }),
    path,
  );
  assert.equal(response.headers.get("content-length"), "10");
  assert.equal(response.body, null);
});
