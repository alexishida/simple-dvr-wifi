export interface ParsedRtspUrl {
  sanitizedUrl: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
}

export interface ParsedHttpUrl {
  sanitizedUrl: string;
  username: string | null;
  password: string | null;
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeUrlInput(raw: string): string {
  return raw.trim().replace(/\\(?=[:/@?&=])/g, "");
}

export function parseRtspUrl(raw: string): ParsedRtspUrl | null {
  let url: URL;
  try {
    url = new URL(normalizeUrlInput(raw));
  } catch {
    return null;
  }

  if (
    (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") ||
    !url.hostname
  ) {
    return null;
  }

  const username = url.username ? decodeUrlComponent(url.username) : null;
  const password = url.password ? decodeUrlComponent(url.password) : null;
  const port = Number(url.port || (url.protocol === "rtsps:" ? 322 : 554));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;

  url.username = "";
  url.password = "";

  return {
    sanitizedUrl: url.toString(),
    host: url.hostname,
    port,
    username,
    password,
  };
}

export function parseHttpUrl(raw: string): ParsedHttpUrl | null {
  let url: URL;
  try {
    url = new URL(normalizeUrlInput(raw));
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname)
    return null;
  const username = url.username ? decodeUrlComponent(url.username) : null;
  const password = url.password ? decodeUrlComponent(url.password) : null;
  url.username = "";
  url.password = "";
  return { sanitizedUrl: url.toString(), username, password };
}

export function rtspUrlWithCredentials(
  raw: string,
  credentials?: { username?: string | null; password?: string | null } | null,
): string | null {
  const parsed = parseRtspUrl(raw);
  if (!parsed) return null;

  const url = new URL(parsed.sanitizedUrl);
  if (credentials?.username) url.username = credentials.username;
  if (credentials?.password) url.password = credentials.password;
  return url.toString();
}
