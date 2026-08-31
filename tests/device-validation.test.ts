import { writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { describe, expect, it } from "vitest";
import {
  OnvifAdapter,
  type OnvifTransport,
} from "../src/workers/camera/onvif-adapter.js";
import { runSegmentedTest } from "../src/workers/camera/segmented-test.js";
import { probeHttp, probeRtsp } from "../src/workers/camera/probes.js";

// Harness de validação por dispositivo (tarefa 15.2). Executado por
// scripts/device-test.mjs; roda somente quando DEVICE_TEST_ONVIF_URL está
// definido. Sem essa variável, o teste é ignorado e não falha na suíte normal.

function nodeRequest(
  urlString: string,
  body: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {},
) {
  return new Promise<{
    status: number;
    body: string;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    const url = new URL(urlString);
    const fn = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = fn(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml", ...options.headers },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (raw += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: raw,
            headers: res.headers as Record<string, string>,
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(options.timeoutMs ?? 5000, () =>
      req.destroy(new Error("timeout")),
    );
    req.end(body);
  });
}

// Remove credenciais embutidas em URLs antes de gravar evidência.
function stripUrlCredentials(url: string | null): string | null {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

const onvifUrl = process.env.DEVICE_TEST_ONVIF_URL ?? "";
const enabled = onvifUrl.length > 0;

describe.skipIf(!enabled)("validação por dispositivo (hardware real)", () => {
  it("roda o teste segmentado e registra o resultado", async () => {
    const username = process.env.DEVICE_TEST_USER || null;
    const password = process.env.DEVICE_TEST_PASS || null;
    const rtspUrl = process.env.DEVICE_TEST_RTSP_URL || null;
    const snapshotUri = process.env.DEVICE_TEST_SNAPSHOT_URI || null;

    const transport: OnvifTransport = {
      post: (url, body, options = {}) => nodeRequest(url, body, options),
    };

    const adapter = new OnvifAdapter({
      deviceServiceUrl: onvifUrl,
      username,
      password,
      transport,
      timeoutMs: 5_000,
    });

    const output = await runSegmentedTest(
      { onvifUrl, rtspUrl, snapshotUri, username, password },
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

    const result = {
      device: {
        onvifUrl: stripUrlCredentials(onvifUrl),
        rtspUrl: stripUrlCredentials(rtspUrl),
        snapshotUri: stripUrlCredentials(snapshotUri),
        hasPtz: "a confirmar",
      },
      segments: output.segments.map((s) => ({
        segment: s.segment,
        status: s.status,
        detail: s.detail,
      })),
      summary: output.summary,
      executedAt: new Date().toISOString(),
    };

    console.log(JSON.stringify(result, null, 2));

    if (process.env.DEVICE_TEST_JSON_OUT) {
      writeFileSync(
        process.env.DEVICE_TEST_JSON_OUT,
        JSON.stringify(result, null, 2) + "\n",
        "utf8",
      );
      console.log(`\nResultado salvo em ${process.env.DEVICE_TEST_JSON_OUT}`);
    }

    expect(output.summary.error).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
