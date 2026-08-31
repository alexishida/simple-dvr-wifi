import { parseXmlSafe, queryAll, queryText } from './xml.js'
import type {
  CameraAdapter,
  CameraOnvifInfo,
  CameraProfileInfo,
  CapabilityState,
} from './adapter.js'

export interface OnvifTransport {
  post(
    url: string,
    body: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{ status: number; body: string }>
}

export interface OnvifClientOptions {
  deviceServiceUrl: string
  username?: string | null
  password?: string | null
  transport: OnvifTransport
  timeoutMs?: number
  maxXmlBytes?: number
}

const DEFAULT_OPTIONS = { timeoutMs: 5_000, maxXmlBytes: 512 * 1024 }

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function soapEnvelope(body: string, username?: string | null, password?: string | null): string {
  const security = username
    ? `<s:Header>
      <Security xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
        <UsernameToken>
          <Username>${escapeXml(username)}</Username>
          <Password>${escapeXml(password ?? '')}</Password>
        </UsernameToken>
      </Security>
    </s:Header>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tr2="http://www.onvif.org/ver20/media/wsdl">
${security}
  <s:Body>${body}</s:Body>
</s:Envelope>`
}

function stateFromBoolean(value: boolean | null | undefined): CapabilityState {
  if (value === true) return 'supported'
  if (value === false) return 'unsupported'
  return 'unknown'
}

function guessStreamType(name: string): 'main' | 'sub' {
  if (/sub|secondary|low-res|stream2|profile_2/i.test(name) && !/main|primary/i.test(name)) {
    return 'sub'
  }
  return 'main'
}

export class OnvifAdapter implements CameraAdapter {
  private readonly options: OnvifClientOptions

  constructor(options: OnvifClientOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  private async call(body: string): Promise<string> {
    const envelope = soapEnvelope(body, this.options.username, this.options.password)
    const response = await this.options.transport.post(this.options.deviceServiceUrl, envelope, {
      timeoutMs: this.options.timeoutMs,
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ONVIF respondeu com status ${response.status}.`)
    }
    return response.body
  }

  async detect(): Promise<CameraOnvifInfo> {
    const info: CameraOnvifInfo = {
      deviceServiceUrl: this.options.deviceServiceUrl,
      identity: { manufacturer: '', model: '', firmwareVersion: '', serialNumber: '' },
      capabilities: {
        onvif: 'supported',
        rtsp: 'unknown',
        snapshot: 'unknown',
        ptz: 'unknown',
        h264: 'unknown',
        h265: 'unknown',
        mjpeg: 'unknown',
      },
      profiles: [],
      mediaServiceUrl: null,
      snapshotUri: null,
      ptzSupported: false,
      rtspMainUrl: null,
      rtspSubUrl: null,
    }

    const identity = await this.fetchIdentity()
    if (identity) info.identity = identity

    const mediaUrl = await this.fetchMediaUrl()
    info.mediaServiceUrl = mediaUrl

    const profiles = await this.fetchProfiles()
    info.ptzSupported = profiles.some((p) => p.ptzAvailable)
    info.capabilities.ptz = stateFromBoolean(info.ptzSupported)
    info.profiles = profiles.map(({ ptzAvailable, ...profile }) => {
      void ptzAvailable
      return profile
    })

    const main = profiles.find((p) => p.streamType === 'main')
    const sub = profiles.find((p) => p.streamType === 'sub')
    info.rtspMainUrl = main?.rtspUrl ?? null
    info.rtspSubUrl = sub?.rtspUrl ?? null
    info.snapshotUri = profiles.find((p) => p.snapshotUri)?.snapshotUri ?? null
    info.capabilities.snapshot = stateFromBoolean(Boolean(info.snapshotUri))

    const codecs = new Set(profiles.map((p) => p.codec).filter(Boolean) as string[])
    info.capabilities.h264 = stateFromBoolean(codecs.has('H264'))
    info.capabilities.h265 = stateFromBoolean(codecs.has('H265'))
    info.capabilities.mjpeg = stateFromBoolean(codecs.has('MJPEG'))
    info.capabilities.rtsp = info.rtspMainUrl ? 'supported' : 'unknown'

    if (identity === null) {
      info.capabilities.onvif = 'error'
    }

    return info
  }

  private async call(body: string): Promise<string> {
    const envelope = soapEnvelope(body, this.options.username, this.options.password)
    const response = await this.options.transport.post(this.options.deviceServiceUrl, envelope, {
      timeoutMs: this.options.timeoutMs,
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ONVIF respondeu com status ${response.status}.`)
    }
    return response.body
  }

  private parseXml(body: string) {
    return parseXmlSafe(body, {
      maxBytes: this.options.maxXmlBytes ?? DEFAULT_OPTIONS.maxXmlBytes,
      maxDepth: 14,
    })
  }

  private async fetchIdentity(): Promise<CameraOnvifInfo['identity'] | null> {
    try {
      const body = await this.call('<tds:GetDeviceInformation/>')
      const node = this.parseXml(body)
      const base = 'Body/GetDeviceInformationResponse'
      return {
        manufacturer: queryText(node, `${base}/Manufacturer`) ?? '',
        model: queryText(node, `${base}/Model`) ?? '',
        firmwareVersion: queryText(node, `${base}/FirmwareVersion`) ?? '',
        serialNumber: queryText(node, `${base}/SerialNumber`) ?? '',
      }
    } catch {
      return null
    }
  }

  private async fetchMediaUrl(): Promise<string | null> {
    try {
      const body = await this.call(
        '<tds:GetCapabilities><tds:Category>Media</tds:Category></tds:GetCapabilities>',
      )
      const node = this.parseXml(body)
      const caps = queryAll(node, 'Body/GetCapabilitiesResponse/Capabilities')
      for (const cap of caps) {
        const media = cap.children.find((c) => c.name === 'Media')
        const xaddr = media?.attributes.XAddr
        if (xaddr) return xaddr
      }
      return null
    } catch {
      return null
    }
  }

  private async fetchProfiles(): Promise<Array<CameraProfileInfo & { ptzAvailable: boolean }>> {
    try {
      const body = await this.call('<trt:GetProfiles/>')
      const node = this.parseXml(body)
      const profiles = queryAll(node, 'Body/GetProfilesResponse/Profiles')
      return profiles.map((profile) => {
        const token = profile.attributes.token ?? ''
        const name = queryText(profile, 'Name') ?? ''
        const videoSource = profile.children.find((c) => c.name === 'VideoSourceConfiguration')
        const encoder = profile.children.find((c) => c.name === 'VideoEncoderConfiguration')
        const ptzConfig = profile.children.find((c) => c.name === 'PTZConfiguration')

        const width = Number(encoder?.attributes.Width ?? videoSource?.attributes.Width ?? NaN)
        const height = Number(encoder?.attributes.Height ?? videoSource?.attributes.Height ?? NaN)
        const fps = Number(encoder?.attributes.FrameRate ?? NaN)

        return {
          token,
          name,
          streamType: guessStreamType(name),
          codec: encoder?.attributes.Encoding ?? null,
          width: Number.isFinite(width) ? width : null,
          height: Number.isFinite(height) ? height : null,
          fps: Number.isFinite(fps) ? fps : null,
          rtspUrl: null,
          snapshotUri: null,
          ptzAvailable: Boolean(ptzConfig),
        }
      })
    } catch {
      return []
    }
  }
}
