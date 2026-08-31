import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface SimulatedCameraConfig {
  manufacturer?: string
  model?: string
  firmwareVersion?: string
  serialNumber?: string
  username?: string
  password?: string
  ptz?: boolean
  profiles?: number
  partialResponses?: boolean
}

const DEFAULT_CONFIG: Required<SimulatedCameraConfig> = {
  manufacturer: 'SimuCam',
  model: 'SIM-100',
  firmwareVersion: '9.9.9',
  serialNumber: 'SIM-SN-001',
  username: 'admin',
  password: 'admin',
  ptz: true,
  profiles: 2,
  partialResponses: false,
}

function soapEnvelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>${body}</s:Body>
</s:Envelope>`
}

export class OnvifSimulator {
  private readonly server: Server
  private readonly config: Required<SimulatedCameraConfig>
  private port = 0
  private requests: Array<{ body: string; action: string }> = []

  constructor(config: SimulatedCameraConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.server = createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk.toString('utf8')))
      req.on('end', () => this.handle(raw, res))
    })
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/onvif/device_service`
  }

  get requestLog(): Array<{ body: string; action: string }> {
    return this.requests
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve))
    const address = this.server.address() as AddressInfo
    this.port = address.port
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    )
  }

  private requiresAuth(
    req: { username?: string; password?: string },
    res: { writeHead(status: number): void; end(body: string): void },
  ): boolean {
    const expected = `${this.config.username}:${this.config.password}`
    const provided = req.username && req.password ? `${req.username}:${req.password}` : ''
    if (provided !== expected) {
      res.writeHead(401)
      res.end(
        '<s:Envelope><s:Body><Fault><Reason>Unauthorized</Reason></Fault></s:Body></s:Envelope>',
      )
      return false
    }
    return true
  }

  private handle(
    raw: string,
    res: {
      writeHead(status: number, headers?: Record<string, string>): void
      end(body: string): void
    },
  ): void {
    const username = /<Username>([^<]+)<\/Username>/.exec(raw)?.[1]
    const password = /<Password>([^<]+)<\/Password>/.exec(raw)?.[1]
    const action =
      /<tds:([A-Za-z]+)/.exec(raw)?.[1] ??
      /<trt:([A-Za-z]+)/.exec(raw)?.[1] ??
      /<tr2:([A-Za-z]+)/.exec(raw)?.[1] ??
      'unknown'

    this.requests.push({ body: raw, action })

    if (!this.requiresAuth({ username, password }, res)) return

    let body: string
    switch (action) {
      case 'GetDeviceInformation':
        body = `<GetDeviceInformationResponse>
          <Manufacturer>${this.config.manufacturer}</Manufacturer>
          <Model>${this.config.model}</Model>
          <FirmwareVersion>${this.config.firmwareVersion}</FirmwareVersion>
          <SerialNumber>${this.config.serialNumber}</SerialNumber>
        </GetDeviceInformationResponse>`
        break
      case 'GetCapabilities':
        body = `<GetCapabilitiesResponse><Capabilities>
          <Media XAddr="http://127.0.0.1:${this.port}/onvif/media_service"/>
        </Capabilities></GetCapabilitiesResponse>`
        break
      case 'GetProfiles':
        body = this.profilesResponse()
        break
      default:
        body = `<UnknownResponse/>`
        break
    }

    res.writeHead(200, { 'Content-Type': 'application/soap+xml' })
    res.end(soapEnvelope(body))
  }

  private profilesResponse(): string {
    const profiles = Array.from({ length: this.config.profiles }, (_, i) => {
      const main = i === 0
      const codec = main ? 'H264' : 'H264'
      const width = main ? 1920 : 640
      const height = main ? 1080 : 360
      const fps = main ? 30 : 15
      const ptz = this.config.ptz && main ? '<PTZConfiguration token="ptz1"/>' : ''
      const name = main ? 'Main Stream' : 'Secondary Stream'
      return `<Profiles token="${main ? 'main_profile' : 'sub_profile'}">
        <Name>${name}</Name>
        <VideoEncoderConfiguration Encoding="${codec}" Width="${width}" Height="${height}" FrameRate="${fps}"/>
        ${ptz}
      </Profiles>`
    })
    return `<GetProfilesResponse>${profiles.join('')}</GetProfilesResponse>`
  }
}

export const SIMULATED_CAMERA_FIXTURES = {
  complete: () => new OnvifSimulator({ profiles: 2, ptz: true }),
  noPtz: () => new OnvifSimulator({ profiles: 2, ptz: false }),
  singleProfile: () => new OnvifSimulator({ profiles: 1 }),
  partial: () => new OnvifSimulator({ profiles: 1, partialResponses: true }),
  authRequired: () => new OnvifSimulator({ username: 'admin', password: 'secret' }),
}
