import { createConnection } from "node:net";
import { probeRtsp } from "../../workers/camera/probes.js";
import { probeOnvifDiscovery } from "./onvif-discovery-identity.js";

export const CAMERA_PORTS = [80, 443, 554, 8554, 2020, 8080, 8899] as const;
const MAX_HOSTS = 254;
const TCP_CONCURRENCY = 64;
const PORT_CONCURRENCY = 4;
const PORT_TIMEOUT_MS = 700;

export type CameraService = "http" | "https" | "rtsp" | "onvif";

export interface NetworkCameraResult {
  host: string;
  endpointReference: null;
  onvifUrl: string | null;
  scopes: string[];
  types: string[];
  services: CameraService[];
  identity: { manufacturer: string | null; model: string | null };
  origins: Array<"active-scan" | "onvif-multicast">;
}

export interface DiscoveryProgress {
  activeHosts: number;
  completedHosts: number;
  totalHosts: number;
}

export interface ServiceFingerprint {
  services: CameraService[];
  onvifUrl?: string | null;
  identity?: { manufacturer: string | null; model: string | null };
}

export function ipv4Range(address: string, netmask: string): string[] {
  const toNumber = (value: string): number | null => {
    const parts = value.split(".").map(Number);
    return parts.length === 4 &&
      parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
      ? ((parts[0]! << 24) >>> 0) +
          (parts[1]! << 16) +
          (parts[2]! << 8) +
          parts[3]!
      : null;
  };
  const ip = toNumber(address);
  const mask = toNumber(netmask);
  const inverseMask = mask === null ? null : ~mask >>> 0;
  if (
    ip === null ||
    mask === null ||
    inverseMask === null ||
    (inverseMask & (inverseMask + 1)) !== 0
  )
    throw new Error("A interface de rede possui uma máscara IPv4 inválida.");
  const network = ip & mask;
  const broadcast = network | inverseMask;
  const count = broadcast - network - 1;
  if (count < 1 || count > MAX_HOSTS)
    throw new Error(
      "A sub-rede selecionada é grande demais para uma varredura segura.",
    );
  const text = (value: number): string =>
    [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
  return Array.from({ length: count }, (_, index) =>
    text(network + index + 1),
  ).filter((host) => host !== address);
}

function aborted(): Error {
  return new Error("A descoberta foi cancelada.");
}

function openPort(
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const socket = createConnection({ host, port });
    const finish = (value: boolean): void => {
      socket.destroy();
      signal?.removeEventListener("abort", cancel);
      resolve(value);
    };
    const cancel = (): void => {
      clearTimeout(timer);
      socket.destroy();
      reject(aborted());
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      finish(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      finish(false);
    });
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

async function eachLimited<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++]!;
        await work(item);
      }
    }),
  );
}

async function fingerprintService(
  host: string,
  port: number,
  signal?: AbortSignal,
): Promise<ServiceFingerprint> {
  if (port === 554 || port === 8554) {
    const result = await probeRtsp({
      url: `rtsp://${host}:${port}/`,
      timeoutMs: PORT_TIMEOUT_MS,
      signal,
      discoveryOnly: true,
    });
    return result === "ok" || result === "auth_error" || result === "locked"
      ? { services: ["rtsp"] }
      : { services: [] };
  }
  const scheme = port === 443 ? "https" : "http";
  const authority = `${scheme}://${host}${(scheme === "http" && port === 80) || (scheme === "https" && port === 443) ? "" : `:${port}`}`;
  const onvifUrl = `${authority}/onvif/device_service`;
  const result = await probeOnvifDiscovery(onvifUrl, signal);
  if (!result) return { services: [] };
  return {
    services: [scheme, "onvif"],
    onvifUrl,
    identity: result.identity ?? undefined,
  };
}

export async function discoverActiveNetworkCameras(input: {
  address: string;
  netmask: string;
  signal?: AbortSignal;
  portProbe?: (
    host: string,
    port: number,
    signal?: AbortSignal,
  ) => Promise<boolean>;
  fingerprint?: (
    host: string,
    port: number,
    signal?: AbortSignal,
  ) => Promise<ServiceFingerprint>;
  onProgress?: (progress: DiscoveryProgress) => void;
}): Promise<NetworkCameraResult[]> {
  const hosts = ipv4Range(input.address, input.netmask);
  const portsByHost = new Map<string, number[]>();
  const completedByHost = new Map<string, number>();
  let complete = 0;
  // Probe TCP directly: many cameras deliberately ignore ICMP echo requests.
  const targets = hosts.flatMap((host) =>
    CAMERA_PORTS.map((port) => ({ host, port })),
  );
  await eachLimited(targets, TCP_CONCURRENCY, async ({ host, port }) => {
    if (input.signal?.aborted) throw aborted();
    const open = await (input.portProbe?.(host, port, input.signal) ??
      openPort(host, port, PORT_TIMEOUT_MS, input.signal));
    if (input.signal?.aborted) throw aborted();
    if (open) portsByHost.set(host, [...(portsByHost.get(host) ?? []), port]);
    const done = (completedByHost.get(host) ?? 0) + 1;
    completedByHost.set(host, done);
    if (done === CAMERA_PORTS.length) {
      complete++;
      input.onProgress?.({
        totalHosts: hosts.length,
        completedHosts: complete,
        activeHosts: portsByHost.size,
      });
    }
  });
  const results: NetworkCameraResult[] = [];
  await eachLimited([...portsByHost.keys()], PORT_CONCURRENCY, async (host) => {
    // Four hosts at a time, seven ports per host: at most 28 service probes.
    // Fingerprint each open port immediately instead of waiting for closed ports.
    const fingerprints = await Promise.all(
      CAMERA_PORTS.filter((port) => portsByHost.get(host)?.includes(port)).map(
        async (port): Promise<ServiceFingerprint> => {
          if (input.signal?.aborted) throw aborted();
          return (input.fingerprint ?? fingerprintService)(
            host,
            port,
            input.signal,
          );
        },
      ),
    );
    const services = [
      ...new Set(fingerprints.flatMap((result) => result.services)),
    ];
    const onvifUrl =
      fingerprints
        .map((result) => result.onvifUrl ?? null)
        .find((url) => url !== null) ?? null;
    const identity = fingerprints
      .map((result) => result.identity)
      .find((value) => value !== undefined) ?? {
      manufacturer: null,
      model: null,
    };
    if (services.includes("rtsp") || services.includes("onvif"))
      results.push({
        host,
        endpointReference: null,
        onvifUrl,
        scopes: [],
        types: [],
        services,
        identity,
        origins: ["active-scan"],
      });
  });
  if (input.signal?.aborted) throw aborted();
  return results.sort((left, right) => left.host.localeCompare(right.host));
}

export function mergeNetworkCameraResults(
  results: NetworkCameraResult[],
): NetworkCameraResult[] {
  const byHost = new Map<string, NetworkCameraResult>();
  for (const result of results) {
    const previous = byHost.get(result.host);
    if (!previous) {
      byHost.set(result.host, {
        ...result,
        services: [...result.services],
        origins: [...result.origins],
      });
      continue;
    }
    previous.services = [
      ...new Set([...previous.services, ...result.services]),
    ];
    previous.origins = [...new Set([...previous.origins, ...result.origins])];
    previous.onvifUrl ??= result.onvifUrl;
    previous.endpointReference ??= result.endpointReference;
    previous.scopes = [...new Set([...previous.scopes, ...result.scopes])];
    previous.types = [...new Set([...previous.types, ...result.types])];
  }
  return [...byHost.values()].sort((left, right) =>
    left.host.localeCompare(right.host),
  );
}
