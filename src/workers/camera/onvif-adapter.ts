import { createHash, randomBytes } from "node:crypto";
import { parseXmlSafe, queryAll, queryText, type XmlNode } from "./xml.js";
import type {
  CameraAdapter,
  CameraOnvifInfo,
  CameraProfileInfo,
  CapabilityState,
} from "./adapter.js";

export interface OnvifTransport {
  post(
    url: string,
    body: string,
    options?: {
      timeoutMs?: number;
      signal?: AbortSignal;
      headers?: Record<string, string>;
    },
  ): Promise<{
    status: number;
    body: string;
    headers?: Record<string, string>;
  }>;
}

export interface OnvifClientOptions {
  deviceServiceUrl: string;
  username?: string | null;
  password?: string | null;
  transport: OnvifTransport;
  timeoutMs?: number;
  maxXmlBytes?: number;
}

export function createFetchOnvifTransport(): OnvifTransport {
  return {
    post: async (url, body, options = {}) => {
      const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 5_000);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
      const response = await fetch(url, {
        method: "POST",
        headers: options.headers,
        body,
        signal,
      });
      return {
        status: response.status,
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
      };
    },
  };
}

const DEFAULT_OPTIONS = { timeoutMs: 5_000, maxXmlBytes: 512 * 1024 };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function soapEnvelope(
  body: string,
  username?: string | null,
  password?: string | null,
): string {
  let security = "";
  if (username) {
    const nonce = randomBytes(16);
    const created = new Date().toISOString();
    const digest = createHash("sha1")
      .update(
        Buffer.concat([
          nonce,
          Buffer.from(created, "utf8"),
          Buffer.from(password ?? "", "utf8"),
        ]),
      )
      .digest("base64");

    security = `<s:Header>
      <wsse:Security s:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:UsernameToken>
          <wsse:Username>${escapeXml(username)}</wsse:Username>
          <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
          <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString("base64")}</wsse:Nonce>
          <wsu:Created>${created}</wsu:Created>
        </wsse:UsernameToken>
      </wsse:Security>
    </s:Header>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tr2="http://www.onvif.org/ver20/media/wsdl" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
${security}
  <s:Body>${body}</s:Body>
</s:Envelope>`;
}

function soapAction(body: string): string | null {
  const operation = /<(tds|trt|tr2|tptz):([A-Za-z][A-Za-z0-9]*)/.exec(body);
  if (!operation) return null;
  const namespace =
    operation[1] === "tds"
      ? "http://www.onvif.org/ver10/device/wsdl"
      : operation[1] === "tr2"
        ? "http://www.onvif.org/ver20/media/wsdl"
        : operation[1] === "tptz"
          ? "http://www.onvif.org/ver20/ptz/wsdl"
          : "http://www.onvif.org/ver10/media/wsdl";
  return `${namespace}/${operation[2]}`;
}

function stateFromBoolean(value: boolean | null | undefined): CapabilityState {
  if (value === true) return "supported";
  if (value === false) return "unsupported";
  return "unknown";
}

function guessStreamType(name: string): "main" | "sub" {
  if (
    /sub|secondary|low-res|stream2|profile_2/i.test(name) &&
    !/main|primary/i.test(name)
  ) {
    return "sub";
  }
  return "main";
}

function classifyProfile(profile: CameraProfileInfo): "main" | "sub" {
  if (guessStreamType(profile.name) === "sub") return "sub";
  if (profile.width !== null && profile.height !== null) {
    // Resolução baixa (ex.: 640x480) indica substream quando o nome não revela.
    if (profile.width <= 1024 && profile.height <= 768) return "sub";
  }
  return "main";
}

export class OnvifAdapter implements CameraAdapter {
  private readonly options: OnvifClientOptions;
  private ptzServiceUrl: string | null = null;
  private primaryProfileToken: string | null = null;

  constructor(options: OnvifClientOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async detect(): Promise<CameraOnvifInfo> {
    const info: CameraOnvifInfo = {
      deviceServiceUrl: this.options.deviceServiceUrl,
      identity: {
        manufacturer: "",
        model: "",
        firmwareVersion: "",
        serialNumber: "",
      },
      capabilities: {
        onvif: "supported",
        rtsp: "unknown",
        snapshot: "unknown",
        ptz: "unknown",
        h264: "unknown",
        h265: "unknown",
        mjpeg: "unknown",
      },
      profiles: [],
      mediaServiceUrl: null,
      snapshotUri: null,
      ptzSupported: false,
      rtspMainUrl: null,
      rtspSubUrl: null,
    };

    const identity = await this.fetchIdentity();
    if (identity) info.identity = identity;

    const mediaUrl = await this.fetchMediaUrl();
    info.mediaServiceUrl = mediaUrl;
    this.ptzServiceUrl =
      (await this.fetchPtzUrl()) ?? this.deriveServiceUrl("ptz_service");

    const profiles = await this.fetchProfiles(mediaUrl);
    this.primaryProfileToken =
      profiles.find((profile) => profile.ptzAvailable)?.token ??
      profiles.find((profile) => profile.streamType === "main")?.token ??
      profiles[0]?.token ??
      null;
    info.ptzSupported = profiles.some((p) => p.ptzAvailable);
    info.capabilities.ptz = stateFromBoolean(info.ptzSupported);
    info.profiles = profiles.map(({ ptzAvailable, ...profile }) => {
      void ptzAvailable;
      return profile;
    });

    // Preenche RTSP por perfil via GetStreamUri quando disponível.
    const withStreams = await Promise.all(
      profiles.map(async (p) => ({
        ...p,
        rtspUrl: p.rtspUrl ?? (await this.fetchStreamUri(p.token, mediaUrl)),
        snapshotUri:
          p.snapshotUri ?? (await this.fetchSnapshotUri(p.token, mediaUrl)),
      })),
    );

    const main = withStreams.find((p) => p.streamType === "main" && p.rtspUrl);
    const sub = withStreams.find((p) => p.streamType === "sub" && p.rtspUrl);
    info.rtspMainUrl = main?.rtspUrl ?? null;
    info.rtspSubUrl = sub?.rtspUrl ?? null;
    info.snapshotUri =
      withStreams.find((p) => p.snapshotUri)?.snapshotUri ?? null;
    info.capabilities.snapshot = stateFromBoolean(Boolean(info.snapshotUri));

    const codecs = new Set(
      withStreams.map((p) => p.codec).filter(Boolean) as string[],
    );
    info.capabilities.h264 = stateFromBoolean(codecs.has("H264"));
    info.capabilities.h265 = stateFromBoolean(codecs.has("H265"));
    info.capabilities.mjpeg = stateFromBoolean(codecs.has("MJPEG"));
    info.capabilities.rtsp = info.rtspMainUrl ? "supported" : "unknown";

    // Atualiza os perfis retornados com os RTSP descobertos.
    info.profiles = withStreams.map(({ ptzAvailable, ...profile }) => {
      void ptzAvailable;
      return profile;
    });

    if (identity === null) {
      info.capabilities.onvif = "error";
    }

    return info;
  }

  private actualProfileToken(profileToken: string): string {
    return profileToken === "main"
      ? (this.primaryProfileToken ?? profileToken)
      : profileToken;
  }

  private deriveServiceUrl(segment: string): string | null {
    try {
      const url = new URL(this.options.deviceServiceUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;
      parts[parts.length - 1] = segment;
      url.pathname = "/" + parts.join("/");
      return url.toString();
    } catch {
      return null;
    }
  }

  async continuousMove(options: {
    profileToken: string;
    velocity: Record<string, number>;
  }): Promise<void> {
    const pan = options.velocity.pan ?? 0;
    const tilt = options.velocity.tilt ?? 0;
    const zoom = options.velocity.zoom ?? 0;
    await this.call(
      `<tptz:ContinuousMove><tptz:ProfileToken>${escapeXml(this.actualProfileToken(options.profileToken))}</tptz:ProfileToken><tptz:Velocity><tt:PanTilt x="${pan}" y="${tilt}"/><tt:Zoom x="${zoom}"/></tptz:Velocity></tptz:ContinuousMove>`,
      this.ptzServiceUrl ?? this.options.deviceServiceUrl,
    );
  }

  async stop(options: { profileToken: string }): Promise<void> {
    await this.call(
      `<tptz:Stop><tptz:ProfileToken>${escapeXml(this.actualProfileToken(options.profileToken))}</tptz:ProfileToken><tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom></tptz:Stop>`,
      this.ptzServiceUrl ?? this.options.deviceServiceUrl,
    );
  }

  async relativeMove(options: {
    profileToken: string;
    velocity: Record<string, number>;
  }): Promise<void> {
    const pan = options.velocity.pan ?? 0;
    const tilt = options.velocity.tilt ?? 0;
    const zoom = options.velocity.zoom ?? 0;
    await this.call(
      `<tptz:RelativeMove><tptz:ProfileToken>${escapeXml(this.actualProfileToken(options.profileToken))}</tptz:ProfileToken><tptz:Translation><tt:PanTilt x="${pan}" y="${tilt}"/><tt:Zoom x="${zoom}"/></tptz:Translation></tptz:RelativeMove>`,
      this.ptzServiceUrl ?? this.options.deviceServiceUrl,
    );
  }

  async absoluteMove(options: {
    profileToken: string;
    position: Record<string, number>;
  }): Promise<void> {
    const pan = options.position.pan ?? 0;
    const tilt = options.position.tilt ?? 0;
    const zoom = options.position.zoom ?? 0;
    await this.call(
      `<tptz:AbsoluteMove><tptz:ProfileToken>${escapeXml(this.actualProfileToken(options.profileToken))}</tptz:ProfileToken><tptz:Position><tt:PanTilt x="${pan}" y="${tilt}"/><tt:Zoom x="${zoom}"/></tptz:Position></tptz:AbsoluteMove>`,
      this.ptzServiceUrl ?? this.options.deviceServiceUrl,
    );
  }

  async listPresets(options: {
    profileToken: string;
  }): Promise<Array<{ token: string; name: string }>> {
    const body = await this.call(
      `<tptz:GetPresets><tptz:ProfileToken>${escapeXml(this.actualProfileToken(options.profileToken))}</tptz:ProfileToken></tptz:GetPresets>`,
      this.ptzServiceUrl ?? this.options.deviceServiceUrl,
    );
    const node = this.parseXml(body);
    return queryAll(node, "Body/GetPresetsResponse/Preset").map((preset) => ({
      token: preset.attributes.token ?? "",
      name: queryText(preset, "Name") ?? preset.attributes.token ?? "Preset",
    }));
  }

  async gotoPreset(options: {
    profileToken: string;
    presetToken: string;
  }): Promise<void> {
    await this.call(
      `<tptz:GotoPreset><tptz:ProfileToken>${escapeXml(this.actualProfileToken(options.profileToken))}</tptz:ProfileToken><tptz:PresetToken>${escapeXml(options.presetToken)}</tptz:PresetToken></tptz:GotoPreset>`,
      this.ptzServiceUrl ?? this.options.deviceServiceUrl,
    );
  }

  async setPreset(options: {
    profileToken: string;
    presetToken?: string;
    name?: string;
  }): Promise<string> {
    const body = await this.call(
      `<tptz:SetPreset><tptz:ProfileToken>${escapeXml(this.actualProfileToken(options.profileToken))}</tptz:ProfileToken>${options.name ? `<tptz:PresetName>${escapeXml(options.name)}</tptz:PresetName>` : ""}${options.presetToken ? `<tptz:PresetToken>${escapeXml(options.presetToken)}</tptz:PresetToken>` : ""}</tptz:SetPreset>`,
      this.ptzServiceUrl ?? this.options.deviceServiceUrl,
    );
    const token = queryText(
      this.parseXml(body),
      "Body/SetPresetResponse/PresetToken",
    );
    return token ?? options.presetToken ?? "";
  }

  async removePreset(options: {
    profileToken: string;
    presetToken: string;
  }): Promise<void> {
    await this.call(
      `<tptz:RemovePreset><tptz:ProfileToken>${escapeXml(this.actualProfileToken(options.profileToken))}</tptz:ProfileToken><tptz:PresetToken>${escapeXml(options.presetToken)}</tptz:PresetToken></tptz:RemovePreset>`,
      this.ptzServiceUrl ?? this.options.deviceServiceUrl,
    );
  }

  private async call(
    body: string,
    serviceUrl = this.options.deviceServiceUrl,
  ): Promise<string> {
    const envelope = soapEnvelope(
      body,
      this.options.username,
      this.options.password,
    );
    const envelopeNoSecurity = soapEnvelope(body, null, null);
    const action = soapAction(body);
    const headers = action
      ? {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"`,
        }
      : undefined;
    const initial = await this.options.transport.post(serviceUrl, envelope, {
      timeoutMs: this.options.timeoutMs,
      headers,
    });
    if (initial.status >= 200 && initial.status < 300) return initial.body;

    // Câmeras (ex.: Intelbras) rejeitam UsernameToken SOAP com 400 e exigem
    // Digest HTTP. Nessas, o desafio digest só é emitido quando o envelope vai
    // sem Security. Tentamos o envelope sem Security e, em 401, fazemos digest.
    if (
      this.options.username &&
      (initial.status === 400 || initial.status === 401)
    ) {
      const bare = await this.options.transport.post(
        serviceUrl,
        envelopeNoSecurity,
        {
          timeoutMs: this.options.timeoutMs,
          headers,
        },
      );
      if (bare.status >= 200 && bare.status < 300) return bare.body;
      if (bare.status === 401) {
        const challenge =
          bare.headers?.["www-authenticate"] ??
          bare.headers?.["WWW-Authenticate"];
        if (challenge && /^Digest/i.test(challenge)) {
          const digest = buildDigestHeader(
            challenge,
            "POST",
            new URL(serviceUrl),
            this.options.username,
            this.options.password ?? "",
          );
          if (digest) {
            const retry = await this.options.transport.post(
              serviceUrl,
              envelopeNoSecurity,
              {
                timeoutMs: this.options.timeoutMs,
                headers: { ...headers, Authorization: `Digest ${digest}` },
              },
            );
            if (retry.status >= 200 && retry.status < 300) return retry.body;
          }
        }
      }
    }

    throw new Error(`ONVIF respondeu com status ${initial.status}.`);
  }

  private parseXml(body: string) {
    return parseXmlSafe(body, {
      maxBytes: this.options.maxXmlBytes ?? DEFAULT_OPTIONS.maxXmlBytes,
      maxDepth: 14,
    });
  }

  private async fetchIdentity(): Promise<CameraOnvifInfo["identity"] | null> {
    try {
      const body = await this.call("<tds:GetDeviceInformation/>");
      const node = this.parseXml(body);
      const base = "Body/GetDeviceInformationResponse";
      return {
        manufacturer: queryText(node, `${base}/Manufacturer`) ?? "",
        model: queryText(node, `${base}/Model`) ?? "",
        firmwareVersion: queryText(node, `${base}/FirmwareVersion`) ?? "",
        serialNumber: queryText(node, `${base}/SerialNumber`) ?? "",
      };
    } catch {
      return null;
    }
  }

  private async fetchMediaUrl(): Promise<string | null> {
    try {
      const body = await this.call(
        "<tds:GetCapabilities><tds:Category>Media</tds:Category></tds:GetCapabilities>",
      );
      const node = this.parseXml(body);
      const caps = queryAll(node, "Body/GetCapabilitiesResponse/Capabilities");
      for (const cap of caps) {
        const media = cap.children.find((c) => c.name === "Media");
        const xaddr =
          media?.attributes.XAddr ?? (media ? queryText(media, "XAddr") : null);
        if (xaddr) return xaddr;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchPtzUrl(): Promise<string | null> {
    try {
      const body = await this.call(
        "<tds:GetCapabilities><tds:Category>PTZ</tds:Category></tds:GetCapabilities>",
      );
      const node = this.parseXml(body);
      const caps = queryAll(node, "Body/GetCapabilitiesResponse/Capabilities");
      for (const cap of caps) {
        const ptz = cap.children.find((child) => child.name === "PTZ");
        const xaddr =
          ptz?.attributes.XAddr ?? (ptz ? queryText(ptz, "XAddr") : null);
        if (xaddr) return xaddr;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchStreamUri(
    profileToken: string,
    mediaServiceUrl: string | null,
  ): Promise<string | null> {
    try {
      const body = await this.call(
        `<trt:GetStreamUri><trt:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream><tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></trt:StreamSetup><trt:ProfileToken>${escapeXml(profileToken)}</trt:ProfileToken></trt:GetStreamUri>`,
        mediaServiceUrl ?? this.options.deviceServiceUrl,
      );
      const node = this.parseXml(body);
      const uri = queryText(node, "Body/GetStreamUriResponse/MediaUri/Uri");
      return uri || null;
    } catch {
      return null;
    }
  }

  private async fetchSnapshotUri(
    profileToken: string,
    mediaServiceUrl: string | null,
  ): Promise<string | null> {
    try {
      const body = await this.call(
        `<trt:GetSnapshotUri><trt:ProfileToken>${escapeXml(profileToken)}</trt:ProfileToken></trt:GetSnapshotUri>`,
        mediaServiceUrl ?? this.options.deviceServiceUrl,
      );
      const node = this.parseXml(body);
      return (
        queryText(node, "Body/GetSnapshotUriResponse/MediaUri/Uri") || null
      );
    } catch {
      return null;
    }
  }

  private async fetchProfiles(
    mediaServiceUrl: string | null,
  ): Promise<Array<CameraProfileInfo & { ptzAvailable: boolean }>> {
    try {
      const body = await this.call(
        "<trt:GetProfiles/>",
        mediaServiceUrl ?? this.options.deviceServiceUrl,
      );
      const node = this.parseXml(body);
      const profiles = queryAll(node, "Body/GetProfilesResponse/Profiles");
      return profiles.map((profile) => {
        const token = profile.attributes.token ?? "";
        const name = queryText(profile, "Name") ?? "";
        const videoSource = profile.children.find(
          (c) => c.name === "VideoSourceConfiguration",
        );
        const encoder = profile.children.find(
          (c) => c.name === "VideoEncoderConfiguration",
        );
        const ptzConfig = profile.children.find(
          (c) => c.name === "PTZConfiguration",
        );

        const width = Number(
          queryText(encoder ?? ({} as XmlNode), "Resolution/Width") ??
            encoder?.attributes.Width ??
            videoSource?.attributes.Width ??
            NaN,
        );
        const height = Number(
          queryText(encoder ?? ({} as XmlNode), "Resolution/Height") ??
            encoder?.attributes.Height ??
            videoSource?.attributes.Height ??
            NaN,
        );
        const fps = Number(
          queryText(encoder ?? ({} as XmlNode), "RateControl/FrameRateLimit") ??
            encoder?.attributes.FrameRate ??
            NaN,
        );
        const profileInfo: CameraProfileInfo = {
          token,
          name,
          streamType: guessStreamType(name),
          codec:
            queryText(encoder ?? ({} as XmlNode), "Encoding") ??
            encoder?.attributes.Encoding ??
            null,
          width: Number.isFinite(width) ? width : null,
          height: Number.isFinite(height) ? height : null,
          fps: Number.isFinite(fps) ? fps : null,
          rtspUrl: null,
          snapshotUri: null,
        };
        return {
          ...profileInfo,
          streamType: classifyProfile(profileInfo),
          ptzAvailable: Boolean(ptzConfig),
        };
      });
    } catch {
      return [];
    }
  }
}

function buildDigestHeader(
  challenge: string,
  method: string,
  url: URL,
  username: string,
  password: string,
): string | null {
  const realm = /realm="([^"]+)"/i.exec(challenge)?.[1];
  const nonce = /nonce="([^"]+)"/i.exec(challenge)?.[1];
  const opaque = /opaque="([^"]+)"/i.exec(challenge)?.[1];
  const qop = /qop="?([^",\s]+)/i.exec(challenge)?.[1];
  if (!realm || !nonce) return null;

  const uri = `${url.pathname}${url.search}`;
  const cnonce = randomBytes(8).toString("hex");
  const nc = "00000001";
  const ha1 = createHash("md5")
    .update(`${username}:${realm}:${password}`)
    .digest("hex");
  const ha2 = createHash("md5").update(`${method}:${uri}`).digest("hex");
  const response = qop
    ? createHash("md5")
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
        .digest("hex")
    : createHash("md5").update(`${ha1}:${nonce}:${ha2}`).digest("hex");

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (opaque) parts.push(`opaque="${opaque}"`);
  return parts.join(", ");
}
