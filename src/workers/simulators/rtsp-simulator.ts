import { createServer, type Server } from 'node:net'
import type { AddressInfo } from 'node:net'

export type SimulatedStreamCodec = 'H264' | 'MJPEG'

export interface RtspSimulatorOptions {
  codec?: SimulatedStreamCodec
  requireAuth?: boolean
  username?: string
  password?: string
}

export class RtspSimulator {
  private readonly server: Server
  private readonly codec: SimulatedStreamCodec
  private readonly requireAuth: boolean
  private readonly username: string
  private readonly password: string
  private port = 0
  private down = false
  private acceptedSessions = 0

  constructor(options: RtspSimulatorOptions = {}) {
    this.codec = options.codec ?? 'H264'
    this.requireAuth = options.requireAuth ?? false
    this.username = options.username ?? 'admin'
    this.password = options.password ?? 'admin'
    this.server = createServer((socket) => {
      socket.setNoDelay(true)
      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        if (!buffer.includes('\r\n\r\n') && !buffer.includes('\n\n')) return
        this.handle(buffer, socket)
      })
    })
  }

  get url(): string {
    return `rtsp://127.0.0.1:${this.port}/simulated`
  }

  get isDown(): boolean {
    return this.down
  }

  get sessionCount(): number {
    return this.acceptedSessions
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

  drop(): void {
    this.down = true
  }

  restore(): void {
    this.down = false
  }

  private handle(
    raw: string,
    socket: { write(body: string): void; end(): void; destroy(): void },
  ): void {
    if (this.down) {
      // Simulate a network drop: close without responding.
      socket.destroy()
      return
    }

    if (this.requireAuth && !this.authorized(raw)) {
      socket.write('RTSP/1.0 401 Unauthorized\r\nWWW-Authenticate: Basic realm="simulated"\r\n\r\n')
      socket.end()
      return
    }

    const method = /^([A-Z]+)/.exec(raw)?.[1] ?? ''
    if (method === 'DESCRIBE') {
      this.acceptedSessions++
      const encoding = this.codec === 'H264' ? '96 H264/90000' : '26 JPEG/90000'
      socket.write(
        `RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Type: application/sdp\r\n\r\n${this.sdp(encoding)}`,
      )
      socket.end()
      return
    }

    socket.write('RTSP/1.0 200 OK\r\n\r\n')
    socket.end()
  }

  private authorized(raw: string): boolean {
    const authMatch = /Authorization:\s*Basic\s+([A-Za-z0-9+/=]+)/.exec(raw)
    if (!authMatch) return false
    const decoded = Buffer.from(authMatch[1] ?? '', 'base64').toString('utf8')
    return decoded === `${this.username}:${this.password}`
  }

  private sdp(encoding: string): string {
    return `v=0\r\ns=Simulated Stream\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:${encoding}\r\n`
  }
}
