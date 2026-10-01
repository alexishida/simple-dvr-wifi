import { randomUUID } from "node:crypto";
import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { parseXmlSafe, type XmlNode } from "../../workers/camera/xml.js";

const DISCOVERY_ADDRESS = "239.255.255.250";
const DISCOVERY_PORT = 3702;
const DISCOVERY_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_DEVICES = 100;

export interface DiscoveryInterface {
  address: string;
  name: string;
}

export interface DiscoveredOnvifDevice {
  endpointReference: string | null;
  host: string;
  onvifUrl: string;
  scopes: string[];
  types: string[];
}

export type DiscoveryScanner = (
  network: DiscoveryInterface,
  timeoutMs: number,
  signal?: AbortSignal,
) => Promise<DiscoveredOnvifDevice[]>;

function isUsableIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every(
      (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
    ) &&
    address !== "0.0.0.0" &&
    !address.startsWith("127.")
  );
}

export function listDiscoveryInterfaces(): DiscoveryInterface[] {
  return Object.entries(networkInterfaces())
    .flatMap(([name, entries]) =>
      (entries ?? [])
        .filter(
          (entry) =>
            entry.family === "IPv4" &&
            !entry.internal &&
            isUsableIpv4(entry.address),
        )
        .map((entry) => ({ name, address: entry.address })),
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.address.localeCompare(right.address),
    );
}

export function buildProbeMessage(
  messageId = `urn:uuid:${randomUUID()}`,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:d="http://docs.oasis-open.org/ws-dd/ns/discovery">
  <s:Header>
    <a:Action>http://docs.oasis-open.org/ws-dd/ns/discovery/2009/01/Probe</a:Action>
    <a:MessageID>${messageId}</a:MessageID>
    <a:To s:mustUnderstand="true">urn:docs-oasis-open-org:ws-dd:ns:discovery:2009:01</a:To>
  </s:Header>
  <s:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></s:Body>
</s:Envelope>`;
}

function findChildren(node: XmlNode, name: string): XmlNode[] {
  const result: XmlNode[] = [];
  if (node.name === name) result.push(node);
  for (const child of node.children) result.push(...findChildren(child, name));
  return result;
}

function childText(node: XmlNode, name: string): string | null {
  const child = node.children.find((candidate) => candidate.name === name);
  return child?.text.trim() || null;
}

function parseServiceUrl(
  raw: string,
): { host: string; onvifUrl: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname ||
    url.username ||
    url.password
  )
    return null;
  return { host: url.hostname, onvifUrl: url.toString() };
}

export function parseProbeMatches(xml: string): DiscoveredOnvifDevice[] {
  if (Buffer.byteLength(xml, "utf8") > MAX_RESPONSE_BYTES) return [];
  let root: XmlNode;
  try {
    root = parseXmlSafe(xml, { maxBytes: MAX_RESPONSE_BYTES, maxDepth: 20 });
  } catch {
    return [];
  }

  const devices = new Map<string, DiscoveredOnvifDevice>();
  for (const match of findChildren(root, "ProbeMatch")) {
    const xaddrs = (childText(match, "XAddrs") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    const service = xaddrs
      .map(parseServiceUrl)
      .find((value): value is NonNullable<typeof value> => value !== null);
    if (!service) continue;
    const endpointReference =
      findChildren(match, "EndpointReference")
        .map((reference) => childText(reference, "Address"))
        .find((value): value is string => value !== null) ?? null;
    const scopes = (childText(match, "Scopes") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 32);
    const types = (childText(match, "Types") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 16);
    const key = `${endpointReference ?? ""}|${service.onvifUrl}`;
    const previous = devices.get(key);
    devices.set(key, {
      endpointReference,
      ...service,
      scopes: scopes.length > 0 ? scopes : (previous?.scopes ?? []),
      types: types.length > 0 ? types : (previous?.types ?? []),
    });
    if (devices.size >= MAX_DEVICES) break;
  }
  return [...devices.values()];
}

function abortedError(): Error {
  return new Error("A descoberta foi cancelada.");
}

const scanInterface: DiscoveryScanner = (network, timeoutMs, signal) => {
  return new Promise((resolve, reject) => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    const devices = new Map<string, DiscoveredOnvifDevice>();
    let finished = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (retryTimer) clearTimeout(retryTimer);
      signal?.removeEventListener("abort", abort);
      try {
        socket.close();
      } catch {
        /* socket can already be closed */
      }
      if (error) reject(error);
      else resolve([...devices.values()]);
    };
    const abort = (): void => finish(abortedError());
    if (signal?.aborted) {
      abort();
      return;
    }
    const receive = (message: Buffer): void => {
      for (const device of parseProbeMatches(message.toString("utf8"))) {
        const key = `${device.endpointReference ?? ""}|${device.onvifUrl}`;
        if (devices.has(key) || devices.size < MAX_DEVICES) devices.set(key, device);
      }
    };
    const timeout = setTimeout(() => finish(), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    socket.once("error", finish);
    socket.on("message", receive);
    socket.bind({ address: network.address, port: 0 }, () => {
      try {
        socket.setMulticastInterface(network.address);
        const message = Buffer.from(buildProbeMessage(), "utf8");
        socket.send(message, DISCOVERY_PORT, DISCOVERY_ADDRESS);
        retryTimer = setTimeout(
          () => {
            if (finished) return;
            try {
              socket.send(message, DISCOVERY_PORT, DISCOVERY_ADDRESS);
            } catch (error) {
              finish(error instanceof Error ? error : new Error("Não foi possível continuar a descoberta."));
            }
          },
          Math.min(1_000, Math.floor(timeoutMs / 2)),
        );
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Não foi possível iniciar a descoberta."),
        );
      }
    });
  });
};

export async function discoverOnvifDevices(
  input: {
    address?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    interfaces?: DiscoveryInterface[];
    scanner?: DiscoveryScanner;
  } = {},
): Promise<DiscoveredOnvifDevice[]> {
  if (input.signal?.aborted) throw abortedError();
  const timeoutMs = Math.min(
    Math.max(input.timeoutMs ?? DISCOVERY_TIMEOUT_MS, 1_000),
    10_000,
  );
  const interfaces = input.interfaces ?? listDiscoveryInterfaces();
  const selected = input.address
    ? interfaces.filter((network) => network.address === input.address)
    : interfaces;
  if (selected.length === 0) {
    if (input.address)
      throw new Error("A interface de rede selecionada não está disponível.");
    return [];
  }
  const results = await Promise.allSettled(
    selected.map((network) => (input.scanner ?? scanInterface)(network, timeoutMs, input.signal)),
  );
  if (input.signal?.aborted) throw abortedError();
  if (results.every((result) => result.status === "rejected")) {
    throw new Error(
      "Não foi possível iniciar a descoberta nas interfaces de rede disponíveis.",
    );
  }
  const devices = new Map<string, DiscoveredOnvifDevice>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const device of result.value) {
      const key = `${device.endpointReference ?? ""}|${device.onvifUrl}`;
      if (devices.has(key) || devices.size < MAX_DEVICES) devices.set(key, device);
    }
  }
  return [...devices.values()].sort((left, right) =>
    left.host.localeCompare(right.host),
  );
}
