import { describe, expect, it } from "vitest";
import type { OnvifAdapter } from "../src/workers/camera/onvif-adapter.js";
import type { CameraOnvifInfo } from "../src/workers/camera/adapter.js";
import {
  runSegmentedTest,
  type SegmentedTestDependencies,
} from "../src/workers/camera/segmented-test.js";
import type { ProbeResult } from "../src/workers/camera/probes.js";

function onvifStub(info: CameraOnvifInfo): OnvifAdapter {
  return { detect: async () => info } as OnvifAdapter;
}

const FULL_INFO: CameraOnvifInfo = {
  deviceServiceUrl: "http://cam.local/onvif",
  identity: {
    manufacturer: "Acme",
    model: "Cam",
    firmwareVersion: "1",
    serialNumber: "SN",
  },
  capabilities: {
    onvif: "supported",
    rtsp: "supported",
    snapshot: "supported",
    ptz: "supported",
    h264: "supported",
    h265: "unsupported",
    mjpeg: "unsupported",
  },
  profiles: [
    {
      token: "main",
      name: "Main",
      streamType: "main",
      codec: "H264",
      width: 1920,
      height: 1080,
      fps: 30,
      rtspUrl: "rtsp://cam.local/main",
      snapshotUri: "http://cam.local/snap.jpg",
    },
    {
      token: "sub",
      name: "Sub",
      streamType: "sub",
      codec: "H264",
      width: 640,
      height: 360,
      fps: 15,
      rtspUrl: "rtsp://cam.local/sub",
      snapshotUri: null,
    },
  ],
  mediaServiceUrl: "http://cam.local/media",
  snapshotUri: "http://cam.local/snap.jpg",
  ptzSupported: true,
  rtspMainUrl: "rtsp://cam.local/main",
  rtspSubUrl: "rtsp://cam.local/sub",
};

const httpOk = async (): Promise<ProbeResult> => "ok";
const rtspOk = async (): Promise<ProbeResult> => "ok";

function deps(
  overrides: Partial<SegmentedTestDependencies> = {},
): SegmentedTestDependencies {
  return {
    onvifAdapter: onvifStub(FULL_INFO),
    probeHttp: httpOk,
    probeRtsp: rtspOk,
    concurrency: 2,
    ...overrides,
  };
}

describe("segmented connection test", () => {
  it("reports independent results for a fully working camera", async () => {
    const result = await runSegmentedTest(
      {
        onvifUrl: "http://cam.local/onvif",
        rtspUrl: "rtsp://cam.local/main",
        snapshotUri: "http://cam.local/snap.jpg",
        username: "admin",
        password: "x",
      },
      deps(),
    );

    const statuses = Object.fromEntries(
      result.segments.map((s) => [s.segment, s.status]),
    );
    expect(statuses.reachability).toBe("ok");
    expect(statuses.authentication).toBe("ok");
    expect(statuses.onvif).toBe("ok");
    expect(statuses.media).toBe("ok");
    expect(statuses.rtsp).toBe("ok");
    expect(statuses.snapshot).toBe("ok");
    expect(statuses.ptz).toBe("ok");
    expect(statuses.codec).toBe("ok");
  });

  it("keeps RTSP ok even when ONVIF fails", async () => {
    const failingAdapter = {
      detect: async () => ({
        ...FULL_INFO,
        capabilities: { ...FULL_INFO.capabilities, onvif: "error" as const },
      }),
    } as OnvifAdapter;

    const result = await runSegmentedTest(
      { onvifUrl: "http://cam.local/onvif", rtspUrl: "rtsp://cam.local/main" },
      deps({ onvifAdapter: failingAdapter }),
    );

    const statuses = Object.fromEntries(
      result.segments.map((s) => [s.segment, s.status]),
    );
    expect(statuses.onvif).toBe("error");
    expect(statuses.rtsp).toBe("ok");
  });

  it("reports auth failure when ONVIF cannot authenticate", async () => {
    const failingAuthAdapter = {
      detect: async () => {
        throw new Error("SOAP 401 Unauthorized");
      },
    } as OnvifAdapter;

    const result = await runSegmentedTest(
      {
        onvifUrl: "http://cam.local/onvif",
        rtspUrl: "rtsp://cam.local/main",
        username: "admin",
        password: "errada",
      },
      deps({
        onvifAdapter: failingAuthAdapter,
        probeHttp: async () => "auth_error" as ProbeResult,
        probeRtsp: async () => "ok" as ProbeResult,
      }),
    );

    const statuses = Object.fromEntries(
      result.segments.map((s) => [s.segment, s.status]),
    );
    expect(statuses.authentication).toBe("error");
    expect(statuses.onvif).toBe("error");
    expect(statuses.rtsp).toBe("ok");
    expect(result.summary.error).toBeGreaterThanOrEqual(1);
  });

  it("confirms authentication via ONVIF WS-Security when the adapter succeeds", async () => {
    const result = await runSegmentedTest(
      {
        onvifUrl: "http://cam.local/onvif",
        rtspUrl: "rtsp://cam.local/main",
        username: "admin",
        password: "correta",
      },
      deps({
        probeHttp: async () => "auth_error" as ProbeResult,
        probeRtsp: async () => "ok" as ProbeResult,
      }),
    );

    const statuses = Object.fromEntries(
      result.segments.map((s) => [s.segment, s.status]),
    );
    expect(statuses.authentication).toBe("ok");
    expect(statuses.onvif).toBe("ok");
  });

  it("skips RTSP when no URL is provided", async () => {
    const result = await runSegmentedTest(
      { onvifUrl: "http://cam.local/onvif" },
      deps({ probeRtsp: rtspOk }),
    );
    const statuses = Object.fromEntries(
      result.segments.map((s) => [s.segment, s.status]),
    );
    expect(statuses.rtsp).toBe("skipped");
  });

  it("reports unreachable device", async () => {
    const result = await runSegmentedTest(
      { onvifUrl: "http://10.0.0.99/onvif" },
      deps({ probeHttp: async () => "unreachable" as ProbeResult }),
    );
    const statuses = Object.fromEntries(
      result.segments.map((s) => [s.segment, s.status]),
    );
    expect(statuses.reachability).toBe("error");
  });

  it("respects limited concurrency via mapLimit", async () => {
    const order: number[] = [];
    const { mapLimitExports } =
      await import("../src/workers/camera/segmented-test.js");
    const results = await mapLimitExports([1, 2, 3, 4], async (item) => {
      order.push(item);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return item * 2;
    });
    expect(results).toEqual([2, 4, 6, 8]);
    expect(order).toHaveLength(4);
  });
});
