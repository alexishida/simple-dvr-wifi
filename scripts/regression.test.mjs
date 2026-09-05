import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm, statfs, writeFile } from "node:fs/promises";
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
