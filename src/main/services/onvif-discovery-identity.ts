import { parseXmlSafe, queryText, queryAll } from "../../workers/camera/xml.js";

export interface DiscoveryIdentity {
  manufacturer: string | null;
  model: string | null;
}

const MAX_BYTES = 64 * 1024;
const ACTION = "http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation";
const BODY = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl"><s:Body><tds:GetDeviceInformation/></s:Body></s:Envelope>`;

/** Confirm the protocol with one bounded anonymous SOAP request, including ONVIF faults. */
export async function probeOnvifDiscovery(
  endpoint: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<{ identity: DiscoveryIdentity | null } | null> {
  try {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const timeout = AbortSignal.timeout(1500);
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      redirect: "manual",
      credentials: "omit",
      headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${ACTION}"` },
      body: BODY,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); return null; }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const xml = Buffer.concat(chunks).toString("utf8");
    const root = parseXmlSafe(xml, { maxBytes: MAX_BYTES, maxDepth: 14 });
    const namespaces = Object.entries(root.attributes)
      .filter(([key]) => key === "xmlns" || key.startsWith("xmlns:"))
      .map(([, value]) => value);
    if (root.name !== "Envelope" || !namespaces.some((value) =>
      value === "http://www.w3.org/2003/05/soap-envelope" ||
      value === "http://schemas.xmlsoap.org/soap/envelope/")) return null;
    const deviceResponse = queryAll(root, "Body/GetDeviceInformationResponse").length > 0;
    const onvifFault = queryAll(root, "Body/Fault").length > 0 &&
      /xmlns(?::[\w.-]+)?\s*=\s*["']http:\/\/www\.onvif\.org\//.test(xml);
    if ((!response.ok || !deviceResponse) && !onvifFault) return null;
    const field = (name: string): string | null =>
      queryText(root, `Body/GetDeviceInformationResponse/${name}`)?.trim().slice(0, 120) || null;
    const identity = { manufacturer: field("Manufacturer"), model: field("Model") };
    return { identity: identity.manufacturer || identity.model ? identity : null };
  } catch {
    return null;
  }
}

/** Failure to read identity never removes a multicast-discovered device. */
export async function discoverOnvifIdentity(
  endpoint: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryIdentity | null> {
  return (await probeOnvifDiscovery(endpoint, signal, fetchImpl))?.identity ?? null;
}

export async function identifyDiscoveredOnvifDevices<T extends { onvifUrl: string }>(
  devices: T[],
  signal?: AbortSignal,
): Promise<Array<T & { identity: DiscoveryIdentity | null }>> {
  const results: Array<T & { identity: DiscoveryIdentity | null }> = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, devices.length) }, async () => {
    while (next < devices.length && !signal?.aborted) {
      const index = next++;
      const device = devices[index]!;
      results[index] = { ...device, identity: await discoverOnvifIdentity(device.onvifUrl, signal) };
    }
  }));
  signal?.throwIfAborted();
  return results;
}
