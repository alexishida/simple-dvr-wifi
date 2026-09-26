import assert from "node:assert/strict";
import test from "node:test";
import { PtzControlService } from "../src/main/services/ptz-control.ts";

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
import { mkdtemp, readFile, readdir, rm, statfs, writeFile } from "node:fs/promises";
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

test("retention policy preserves protected and active media", () => {
  const selected = selectRetentionCandidates([
    { id: "protected", timestamp: 1, bytes: 50, protected: true, active: false },
    { id: "active", timestamp: 2, bytes: 50, protected: false, active: true },
    { id: "old", timestamp: 3, bytes: 50, protected: false, active: false },
  ], { now: 1000, maxAgeDays: 0, maxBytes: 100 });
  assert.deepEqual(selected, ["old"]);
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
  const ready = new Promise((resolveReady) => { runnerReady = resolveReady; });
  const executor = {
    run: ({ args, onProgress }) =>
      new Promise((resolveRun) => {
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
  const runner = new FfmpegRunner(binary);
  const generated = await runner.run({
    binaryPath: binary,
    args: [
      "-hide_banner", "-nostdin", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=10",
      "-t", "1", "-c:v", "mpeg4", "-y", source,
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
