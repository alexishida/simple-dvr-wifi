import type { OnvifAdapter } from "./onvif-adapter.js";
import type { CameraOnvifInfo } from "./adapter.js";
import type { ProbeResult } from "./probes.js";

export type SegmentName =
  | "reachability"
  | "authentication"
  | "onvif"
  | "media"
  | "rtsp"
  | "snapshot"
  | "ptz"
  | "codec";

export interface SegmentResult {
  segment: SegmentName;
  status: "ok" | "warn" | "error" | "skipped";
  detail: string;
}

export interface SegmentedTestInput {
  onvifUrl: string;
  rtspUrl: string | null;
  snapshotUri: string | null;
  username?: string | null;
  password?: string | null;
}

export interface SegmentedTestOutput {
  segments: SegmentResult[];
  summary: { ok: number; warn: number; error: number; skipped: number };
}

export interface SegmentedTestDependencies {
  onvifAdapter?: OnvifAdapter;
  probeHttp?: (
    url: string,
    credentials?: { username?: string | null; password?: string | null },
  ) => Promise<ProbeResult>;
  probeRtsp?: (
    url: string,
    credentials?: { username?: string | null; password?: string | null },
  ) => Promise<ProbeResult>;
  concurrency?: number;
}

function ok(segment: SegmentName, detail: string): SegmentResult {
  return { segment, status: "ok", detail };
}
function warn(segment: SegmentName, detail: string): SegmentResult {
  return { segment, status: "warn", detail };
}
function error(segment: SegmentName, detail: string): SegmentResult {
  return { segment, status: "error", detail };
}
function skipped(segment: SegmentName, detail: string): SegmentResult {
  return { segment, status: "skipped", detail };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const current = index++;
        results[current] = await fn(items[current]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function runSegmentedTest(
  input: SegmentedTestInput,
  deps: SegmentedTestDependencies = {},
): Promise<SegmentedTestOutput> {
  const concurrency = deps.concurrency ?? 2;
  const credentials = { username: input.username, password: input.password };
  const probeHttp =
    deps.probeHttp ??
    (async (url) => (await import("./probes.js")).probeHttp({ url }));
  const probeRtsp =
    deps.probeRtsp ??
    (async (url) => (await import("./probes.js")).probeRtsp({ url }));

  const segments = new Map<SegmentName, SegmentResult>();

  const [reachResult, authResult] = await mapLimit(
    [
      async () => probeHttp(input.onvifUrl, credentials),
      async () => probeHttp(input.onvifUrl, credentials),
    ],
    concurrency,
    (fn) => fn(),
  );

  segments.set(
    "reachability",
    reachResult === "ok" || reachResult === "auth_error"
      ? ok("reachability", "Endpoint ONVIF acessível.")
      : reachResult === "timeout"
        ? error("reachability", "Timeout ao acessar o dispositivo.")
        : error("reachability", "Dispositivo inalcançável."),
  );

  segments.set(
    "authentication",
    authResult === "auth_error"
      ? error("authentication", "Credenciais rejeitadas.")
      : authResult === "ok"
        ? ok("authentication", "Autenticação validada.")
        : warn("authentication", "Autenticação não pôde ser confirmada."),
  );

  let onvifInfo: CameraOnvifInfo | null = null;
  if (deps.onvifAdapter) {
    try {
      onvifInfo = await deps.onvifAdapter.detect();
      if (onvifInfo.capabilities.onvif === "error") {
        segments.set("onvif", error("onvif", "ONVIF indisponível."));
      } else if (onvifInfo.profiles.length > 0) {
        segments.set(
          "onvif",
          ok(
            "onvif",
            `Identidade e ${onvifInfo.profiles.length} perfil(is) detectados.`,
          ),
        );
        // Autenticação ONVIF é validada via WS-Security (SOAP) pelo adaptador;
        // um GET HTTP + Basic não representa o esquema real do dispositivo.
        segments.set(
          "authentication",
          ok("authentication", "Autenticação ONVIF validada (WS-Security)."),
        );
      } else {
        segments.set("onvif", warn("onvif", "ONVIF respondeu sem perfis."));
      }
    } catch {
      segments.set("onvif", error("onvif", "Falha ao consultar ONVIF."));
    }
  } else {
    segments.set("onvif", skipped("onvif", "ONVIF não configurado."));
  }

  if (onvifInfo) {
    segments.set(
      "media",
      onvifInfo.mediaServiceUrl
        ? ok("media", "Serviço de mídia disponível.")
        : warn("media", "Serviço de mídia não declarado."),
    );

    const codecs = new Set(
      onvifInfo.profiles.map((p) => p.codec).filter(Boolean) as string[],
    );
    if (codecs.size > 0) {
      segments.set("codec", ok("codec", `Codecs: ${[...codecs].join(", ")}.`));
    } else {
      segments.set("codec", warn("codec", "Nenhum codec identificado."));
    }

    segments.set(
      "snapshot",
      onvifInfo.snapshotUri
        ? ok("snapshot", "Endpoint de snapshot declarado.")
        : warn("snapshot", "Snapshot não declarado."),
    );

    segments.set(
      "ptz",
      onvifInfo.ptzSupported
        ? ok("ptz", "PTZ configurado.")
        : warn("ptz", "PTZ não confirmado."),
    );
  } else {
    for (const segment of ["media", "codec", "snapshot", "ptz"] as const) {
      segments.set(segment, skipped(segment, "Depende de ONVIF."));
    }
  }

  segments.set(
    "rtsp",
    input.rtspUrl
      ? await probeRtsp(input.rtspUrl, credentials).then((result) =>
          result === "ok"
            ? ok("rtsp", "Stream RTSP acessível.")
            : result === "auth_error"
              ? error("rtsp", "RTSP rejeitou as credenciais.")
              : error("rtsp", "Stream RTSP inacessível."),
        )
      : skipped("rtsp", "URL RTSP não informada."),
  );

  const ordered: SegmentName[] = [
    "reachability",
    "authentication",
    "onvif",
    "media",
    "rtsp",
    "snapshot",
    "ptz",
    "codec",
  ];

  const summary = { ok: 0, warn: 0, error: 0, skipped: 0 };
  for (const result of segments.values()) {
    summary[result.status]++;
  }

  return {
    segments: ordered.map((segment) => segments.get(segment)!),
    summary,
  };
}

export async function mapLimitExports(
  items: string[],
  fn: (item: string) => Promise<number>,
): Promise<number[]> {
  return mapLimit(items, 2, fn);
}
