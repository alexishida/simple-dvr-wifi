import { createHash, randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import { connect as createTlsConnection } from "node:tls";

export type ProbeResult =
  "ok" | "unreachable" | "timeout" | "auth_error" | "unsupported";

export interface HttpProbeOptions {
  url: string;
  username?: string | null;
  password?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: (url: string, init: RequestInit) => Promise<{ status: number }>;
}

export interface RtspProbeOptions {
  url: string;
  username?: string | null;
  password?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  checkImpl?: (options: RtspCheckOptions) => Promise<ProbeResult>;
}

export interface RtspCheckOptions {
  url: URL;
  username?: string | null;
  password?: string | null;
  timeoutMs: number;
  signal?: AbortSignal;
}

function parseUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL de probe deve ser HTTP(S).");
  }
  return url;
}

function buildAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function probeHttp(
  options: HttpProbeOptions,
): Promise<ProbeResult> {
  const url = parseUrl(options.url);
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const headers: Record<string, string> = { Accept: "*/*" };
  if (options.username) {
    headers.Authorization = buildAuthorization(
      options.username,
      options.password ?? "",
    );
  }

  try {
    const fetchImpl = options.fetchImpl ?? ((u, init) => fetch(u, init));
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers,
      signal,
    });
    if (controller.signal.aborted) return "timeout";
    if (response.status === 401 || response.status === 403) {
      return options.username ? "auth_error" : "unsupported";
    }
    return response.status < 500 ? "ok" : "unreachable";
  } catch (error) {
    if (options.signal?.aborted || controller.signal.aborted) return "timeout";
    if (error instanceof Error && error.name === "AbortError") return "timeout";
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

export async function probeRtsp(
  options: RtspProbeOptions,
): Promise<ProbeResult> {
  const url = new URL(options.url);
  if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") {
    return "unsupported";
  }
  const timeoutMs = options.timeoutMs ?? 5_000;
  const checkImpl =
    options.checkImpl ??
    (async (checkOptions: RtspCheckOptions): Promise<ProbeResult> => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        checkOptions.timeoutMs,
      );
      try {
        const signal = checkOptions.signal
          ? AbortSignal.any([checkOptions.signal, controller.signal])
          : controller.signal;
        return await probeRtspTcp(checkOptions, signal);
      } catch {
        return controller.signal.aborted || checkOptions.signal?.aborted
          ? "timeout"
          : "unreachable";
      } finally {
        clearTimeout(timer);
      }
    });

  return checkImpl({
    url,
    username: options.username,
    password: options.password,
    timeoutMs,
    signal: options.signal,
  });
}

async function probeRtspTcp(
  options: RtspCheckOptions,
  signal: AbortSignal,
): Promise<ProbeResult> {
  const url = options.url;
  const path = `${url.pathname}${url.search}`;
  const uri = `${url.protocol}//${url.host}${path}`;
  const username = (options.username ?? url.username) || null;
  const password = (options.password ?? url.password) || null;
  signal.throwIfAborted();

  const socket = await new Promise<import("node:net").Socket>(
    (resolve, reject) => {
      const connectionOptions = {
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: Number(url.port || (url.protocol === "rtsps:" ? 322 : 554)),
        signal,
      };
      const secure = url.protocol === "rtsps:";
      const sock = secure
        ? createTlsConnection(connectionOptions)
        : createConnection(connectionOptions);
      sock.setTimeout(options.timeoutMs);
      const onClose = (): void => reject(new Error("closed"));
      const onTimeout = (): void => {
        sock.destroy();
        reject(new Error("timeout"));
      };
      sock.once("close", onClose);
      sock.once("timeout", onTimeout);
      sock.once(secure ? "secureConnect" : "connect", () => {
        sock.removeListener("error", reject);
        sock.removeListener("close", onClose);
        sock.removeListener("timeout", onTimeout);
        resolve(sock);
      });
      sock.once("error", reject);
    },
  );

  try {
    let sequence = 0;
    const describe = (
      authorization: string | null,
    ): Promise<{ status: number; text: string }> =>
      new Promise((resolve, reject) => {
        const headers = [
          `DESCRIBE ${uri} RTSP/1.0`,
          `CSeq: ${++sequence}`,
          "User-Agent: SimpleDvrWifi",
          "Accept: application/sdp",
        ];
        if (authorization) headers.push(`Authorization: ${authorization}`);
        let received = Buffer.alloc(0);
        const onData = (data: Buffer): void => {
          if (received.length + data.length > 1024 * 1024) {
            onError();
            return;
          }
          received = Buffer.concat([received, data]);
          const headerEnd = received.indexOf("\r\n\r\n");
          if (headerEnd < 0) return;
          const text = received.subarray(0, headerEnd).toString("utf8");
          const bodyLength = Number(
            /Content-Length:\s*(\d+)/i.exec(text)?.[1] ?? 0,
          );
          if (received.length < headerEnd + 4 + bodyLength) return;
          cleanup();
          const statusMatch = /^RTSP\/1\.0 (\d{3})/.exec(text);
          resolve({ status: statusMatch ? Number(statusMatch[1]) : 0, text });
        };
        const onError = (): void => {
          cleanup();
          reject(new Error("socket error"));
        };
        const onTimeout = (): void => {
          cleanup();
          reject(new Error("timeout"));
        };
        const onClose = (): void => {
          cleanup();
          reject(new Error("closed"));
        };
        const cleanup = (): void => {
          socket.removeListener("data", onData);
          socket.removeListener("error", onError);
          socket.removeListener("timeout", onTimeout);
          socket.removeListener("close", onClose);
        };
        socket.on("data", onData);
        socket.once("error", onError);
        socket.once("timeout", onTimeout);
        socket.once("close", onClose);
        socket.write(headers.join("\r\n") + "\r\n\r\n");
      });

    const first = await describe(null);
    if (/^RTSP\/1\.0 2\d\d/.test(first.text)) return "ok";

    if (first.status === 401) {
      if (!username) return "auth_error";
      const challenge =
        /WWW-Authenticate:\s*([^\r\n]+)/i.exec(first.text)?.[1] ?? "";
      if (/^Digest/i.test(challenge)) {
        const response = digestChallenge(
          challenge,
          "DESCRIBE",
          uri,
          username,
          password ?? "",
        );
        if (!response) return "auth_error";
        const second = await describe(`Digest ${response}`);
        return /^RTSP\/1\.0 2\d\d/.test(second.text) ? "ok" : "auth_error";
      }
      if (/^Basic/i.test(challenge)) {
        const authorization = buildAuthorization(username, password ?? "");
        const second = await describe(authorization);
        return /^RTSP\/1\.0 2\d\d/.test(second.text) ? "ok" : "auth_error";
      }
      return "auth_error";
    }

    return /^RTSP\/1\.0 2\d\d/.test(first.text) ? "ok" : "timeout";
  } finally {
    socket.destroy();
  }
}

function digestChallenge(
  header: string,
  method: string,
  uri: string,
  username: string,
  password: string,
): string | null {
  const realm = /realm="([^"]+)"/i.exec(header)?.[1];
  const nonce = /nonce="([^"]+)"/i.exec(header)?.[1];
  if (!realm || !nonce) return null;
  const ha1 = createHash("md5")
    .update(`${username}:${realm}:${password}`)
    .digest("hex");
  const ha2 = createHash("md5").update(`${method}:${uri}`).digest("hex");
  const qop = /qop="([^"]+)"/i.exec(header)?.[1];
  if (
    qop
      ?.split(",")
      .map((value) => value.trim())
      .includes("auth")
  ) {
    const nc = "00000001";
    const cnonce = randomBytes(12).toString("hex");
    const response = createHash("md5")
      .update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
      .digest("hex");
    return `username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  }

  const response = createHash("md5")
    .update(`${ha1}:${nonce}:${ha2}`)
    .digest("hex");
  return `username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
}
