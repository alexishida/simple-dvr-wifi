import {
  autoRtspCandidate,
  type AutoRtspCandidate,
} from "./camera-auto-config.js";
import { parseCameraAddress, parseRtspUrl } from "../../shared/camera-urls.js";
import {
  OnvifAdapter,
  OnvifAuthenticationError,
  createFetchOnvifTransport,
} from "../../workers/camera/onvif-adapter.js";
import { probeRtsp } from "../../workers/camera/probes.js";

const ONVIF_CANDIDATES = [
  { protocol: "http:", port: "" },
  { protocol: "http:", port: "8080" },
  { protocol: "http:", port: "8899" },
  { protocol: "http:", port: "2020" },
  { protocol: "https:", port: "" },
] as const;
const TOTAL_TIMEOUT_MS = 12_000;

export interface CameraAutoConfigSegment {
  name: "onvif" | "rtsp";
  status: "ok" | "error" | "skipped";
  detail: string;
}

export interface CameraAutoConfigResult {
  status: "connected" | "unavailable";
  segments: CameraAutoConfigSegment[];
  onvifUrl: string | null;
  identified: {
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    rtspUrl: string | null;
    source: AutoRtspCandidate["source"] | null;
  } | null;
}

function hostForUrl(raw: string): string | null {
  return parseCameraAddress(raw)?.host ?? null;
}

export function onvifEndpointCandidates(host: string): string[] {
  const hostname = hostForUrl(host);
  if (!hostname) return [];

  const candidates = ONVIF_CANDIDATES.map(({ protocol, port }) => {
    const url = new URL(`${protocol}//placeholder/onvif/device_service`);
    url.hostname = hostname;
    url.port = port;
    return url.toString();
  });
  const explicit = parseCameraAddress(host)!;
  if (explicit.port !== null)
    candidates.unshift(new URL(`http://${hostname}:${explicit.port}/onvif/device_service`).toString());
  return [...new Set(candidates)];
}

function field(value: string): string | null {
  return value.trim().slice(0, 120) || null;
}

export async function autoConfigureCameraHost(input: {
  host: string;
  username?: string | null;
  password?: string | null;
  onvifUrl?: string | null;
  timeoutMs?: number;
}): Promise<CameraAutoConfigResult> {
  let candidates = onvifEndpointCandidates(input.host);
  if (candidates.length === 0) {
    throw new Error("Informe um IP ou hostname válido.");
  }
  if (input.onvifUrl) {
    const endpoint = new URL(input.onvifUrl);
    if (
      !["http:", "https:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hostname !== hostForUrl(input.host)
    ) {
      throw new Error("O endereço ONVIF deve pertencer à câmera informada.");
    }
    candidates = [endpoint.toString()];
  }

  const deadline =
    Date.now() +
    Math.min(input.timeoutMs ?? TOTAL_TIMEOUT_MS, TOTAL_TIMEOUT_MS);
  let onvifUrl: string | null = null;
  let identified: CameraAutoConfigResult["identified"] = null;
  const transport = createFetchOnvifTransport();
  const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));

  for (const candidate of candidates) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    try {
      const info = await new OnvifAdapter({
        deviceServiceUrl: candidate,
        username: input.username?.trim() || undefined,
        password: input.password || undefined,
        transport: {
          post: (url, body, options) => {
            signal.throwIfAborted();
            return transport.post(url, body, {
              ...options,
              signal,
              timeoutMs: Math.max(
                1,
                Math.min(options?.timeoutMs ?? 3_000, deadline - Date.now()),
              ),
            });
          },
        },
        timeoutMs: Math.min(remaining, 1_500),
      }).detect();
      if (info.capabilities.onvif === "error") continue;

      onvifUrl = candidate;
      identified = {
        manufacturer: field(info.identity.manufacturer),
        model: field(info.identity.model),
        serialNumber: field(info.identity.serialNumber),
        rtspUrl: null,
        source: null,
      };
      const rtspCandidate = autoRtspCandidate(info, hostForUrl(input.host)!, null);
      const rtsp = rtspCandidate && parseRtspUrl(rtspCandidate.url);
      if (!rtsp) {
        return {
          status: "unavailable",
          onvifUrl,
          identified,
          segments: [
            { name: "onvif", status: "ok", detail: "ONVIF acessível." },
            {
              name: "rtsp",
              status: "skipped",
              detail: "A câmera não informou um stream utilizável.",
            },
          ],
        };
      }

      // Preserve the advertised candidate for manual correction even if access fails.
      identified.rtspUrl = rtsp.sanitizedUrl;
      identified.source = rtspCandidate.source;
      const rtspResult = await probeRtsp({
        url: rtsp.sanitizedUrl,
        username: input.username?.trim() || undefined,
        password: input.password || undefined,
        timeoutMs: Math.max(1, Math.min(5_000, deadline - Date.now())),
        signal,
      });
      if (rtspResult === "ok") {
        return {
          status: "connected",
          onvifUrl,
          identified,
          segments: [
            { name: "onvif", status: "ok", detail: "ONVIF acessível." },
            {
              name: "rtsp",
              status: "ok",
              detail: `Stream RTSP acessível via ${rtspCandidate.source === "onvif" ? "ONVIF" : "referência de modelo"}.`,
            },
          ],
        };
      }
      return {
        status: "unavailable",
        onvifUrl,
        identified,
        segments: [
          { name: "onvif", status: "ok", detail: "ONVIF acessível." },
          {
            name: "rtsp",
            status: "error",
            detail:
              rtspResult === "auth_error"
                ? "Credenciais RTSP rejeitadas."
                : rtspResult === "locked"
                  ? "A câmera bloqueou temporariamente o acesso ao vídeo."
                  : "Stream RTSP inacessível.",
          },
        ],
      };
    } catch (error) {
      if (error instanceof OnvifAuthenticationError) {
        return {
          status: "unavailable",
          onvifUrl: candidate,
          identified: null,
          segments: [{ name: "onvif", status: "error", detail: error.message }],
        };
      }
    }
  }

  return {
    status: "unavailable",
    onvifUrl,
    identified,
    segments: [
      {
        name: "onvif",
        status: "error",
        detail: "Nenhum endpoint ONVIF respondeu no endereço informado.",
      },
    ],
  };
}
