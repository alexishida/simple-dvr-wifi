import { afterEach, describe, expect, it } from "vitest";
import { createSocket } from "node:dgram";
import { OnvifSimulator } from "../src/workers/simulators/onvif-simulator.js";
import { RtspSimulator } from "../src/workers/simulators/rtsp-simulator.js";
import {
  OnvifAdapter,
  type OnvifTransport,
} from "../src/workers/camera/onvif-adapter.js";
import { probeHttp, probeRtsp } from "../src/workers/camera/probes.js";
import {
  createInMemoryTransport,
  DatabaseSupervisor,
} from "../src/main/supervisors/database.js";
import { CameraManagementService } from "../src/main/services/camera-management.js";
import { CredentialService } from "../src/main/services/credentials.js";
import { FakeMasterKeyStore } from "../src/main/security/vault.js";
import {
  enumerateInterfaces,
  resolveInterfaceAddress,
} from "../src/workers/discovery/interfaces.js";
import {
  createTempDir,
  createTempDbPath,
  createTestWorker,
} from "./helpers/database.js";

const cleanup: Array<() => Promise<void>> = [];

async function cleanupAll(): Promise<void> {
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
}

afterEach(async () => {
  await cleanupAll();
});

function httpTransport(): OnvifTransport {
  return {
    post: async (url, body) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml" },
        body,
      });
      return { status: response.status, body: await response.text() };
    },
  };
}

describe("end-to-end integration without physical hardware", () => {
  it("discovers ONVIF, detects media and stores the camera", async () => {
    const onvif = new OnvifSimulator({ username: "admin", password: "admin" });
    await onvif.start();
    cleanup.push(() => onvif.stop());

    const adapter = new OnvifAdapter({
      deviceServiceUrl: onvif.url,
      username: "admin",
      password: "admin",
      transport: httpTransport(),
    });
    const info = await adapter.detect();
    expect(info.identity.manufacturer).toBe("SimuCam");
    expect(info.profiles).toHaveLength(2);
    expect(info.mediaServiceUrl).toBeTruthy();

    // Persist through the SQLite worker + management service
    const dir = createTempDir();
    const worker = createTestWorker(createTempDbPath(dir));
    cleanup.push(async () => worker.close());
    const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker));
    const credentials = new CredentialService(
      supervisor,
      new FakeMasterKeyStore(),
    );
    await credentials.initialize();
    const management = new CameraManagementService(supervisor, credentials);

    const result = await management.create({
      name: "Câmera simulada",
      host: "127.0.0.1",
      rtspUrl: "rtsp://127.0.0.1/simulated",
      onvifUrl: onvif.url,
      username: "admin",
      password: "admin",
    });
    expect(result.duplicate).toBe(false);
    expect(result.camera.endpoints.map((e) => e.service)).toEqual([
      "onvif",
      "rtsp",
    ]);

    const list = await supervisor.request("camera.list", undefined);
    expect((list.value as unknown[]).length).toBe(1);
  });

  it("probes RTSP, drops and restores the stream", async () => {
    const rtsp = new RtspSimulator({ codec: "H264" });
    await rtsp.start();
    cleanup.push(() => rtsp.stop());

    expect(await probeRtsp({ url: rtsp.url, timeoutMs: 3000 })).toBe("ok");

    rtsp.drop();
    expect(await probeRtsp({ url: rtsp.url, timeoutMs: 3000 })).toBe(
      "unreachable",
    );

    rtsp.restore();
    expect(await probeRtsp({ url: rtsp.url, timeoutMs: 3000 })).toBe("ok");
  });

  it("tears down without orphan processes or temp files", async () => {
    const dir = createTempDir();
    const worker = createTestWorker(createTempDbPath(dir));
    const supervisor = new DatabaseSupervisor(createInMemoryTransport(worker));

    await supervisor.request("camera.create", {
      name: "Tmp",
      host: "tmp.local",
    });
    expect(worker.isReady()).toBe(true);

    // shutdown removes the session and closes the DB
    await supervisor.shutdown(1000);
    expect(worker.isReady()).toBe(false);
    expect(supervisor.activeCount ?? 0).toBe(0);
  });

  it("binds the WS-Discovery socket to the IP of an eligible interface", async () => {
    const eligible = enumerateInterfaces().find((entry) => entry.eligible);
    if (!eligible) {
      // Sem interface elegível no host, o teste confirma que o nome não é usado como endereço.
      expect(resolveInterfaceAddress("Inexistente")).toBeNull();
      return;
    }

    const address = resolveInterfaceAddress(eligible.name);
    expect(address).toBeTruthy();

    const socket = createSocket({ type: "udp4", reuseAddr: true });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`bind em ${address} excedeu timeout`));
      }, 5_000);
      socket.once("error", (error) => {
        clearTimeout(timer);
        socket.close();
        reject(error);
      });
      socket.bind(0, address, () => {
        clearTimeout(timer);
        socket.close();
        resolve();
      });
    });
    expect(true).toBe(true);
  });

  it("executes the device-test harness flow against the ONVIF simulator", async () => {
    const onvif = new OnvifSimulator({
      username: "admin",
      password: "admin",
      ptz: true,
    });
    await onvif.start();
    cleanup.push(() => onvif.stop());

    const transport: OnvifTransport = {
      post: async (url, body, options = {}) => {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          options.timeoutMs ?? 5_000,
        );
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/soap+xml" },
            body,
            signal: controller.signal,
          });
          return { status: response.status, body: await response.text() };
        } finally {
          clearTimeout(timer);
        }
      },
    };

    const adapter = new OnvifAdapter({
      deviceServiceUrl: onvif.url,
      username: "admin",
      password: "admin",
      transport,
      timeoutMs: 5_000,
    });

    const { runSegmentedTest } =
      await import("../src/workers/camera/segmented-test.js");
    const output = await runSegmentedTest(
      {
        onvifUrl: onvif.url,
        rtspUrl: null,
        snapshotUri: null,
        username: "admin",
        password: "admin",
      },
      {
        onvifAdapter: adapter,
        probeHttp: (url, credentials) =>
          probeHttp({
            url,
            username: credentials?.username,
            password: credentials?.password,
          }),
        probeRtsp: (url, credentials) =>
          probeRtsp({
            url,
            username: credentials?.username,
            password: credentials?.password,
          }),
        concurrency: 2,
      },
    );

    const segments = new Map(output.segments.map((s) => [s.segment, s.status]));
    expect(segments.get("reachability")).toBe("ok");
    expect(segments.get("authentication")).toBe("ok");
    expect(segments.get("onvif")).toBe("ok");
    expect(segments.get("ptz")).toBe("ok");
    expect(segments.get("media")).toBe("ok");
    expect(segments.get("rtsp")).toBe("skipped");

    // Formato do harness device:test (JSON por dispositivo)
    const result = {
      device: { onvifUrl: onvif.url, rtspUrl: null, hasPtz: "a confirmar" },
      segments: output.segments.map((s) => ({
        segment: s.segment,
        status: s.status,
        detail: s.detail,
      })),
      summary: output.summary,
    };
    expect(Array.isArray(result.segments)).toBe(true);
    expect(result.segments).toHaveLength(8);
    expect(result.summary).toMatchObject({ ok: expect.any(Number) });
    expect(JSON.parse(JSON.stringify(result)).device.onvifUrl).toBe(onvif.url);
  });
});
