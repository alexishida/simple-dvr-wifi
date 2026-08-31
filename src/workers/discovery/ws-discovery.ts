import { createSocket } from 'node:dgram'

export const WS_DISCOVERY_ADDRESS = '239.255.255.250'
export const WS_DISCOVERY_PORT = 3702

export interface DiscoveryTarget {
  epr: string
  addresses: string[]
  types: string[]
  scopes: string[]
}

export interface DiscoveryProgress {
  interfaceName: string
  found: DiscoveryTarget[]
}

function decodeTypes(typesXml: string): string[] {
  const matches = [...typesXml.matchAll(/<d:Types[^>]*>([^<]+)<\/d:Types>/g)]
  return matches.flatMap((m) => (m[1] ?? '').split(' ').filter(Boolean))
}

function decodeScopes(scopesXml: string): string[] {
  const matches = [...scopesXml.matchAll(/<d:Scopes[^>]*>([^<]+)<\/d:Scopes>/g)]
  return matches.flatMap((m) => (m[1] ?? '').split(' ').filter(Boolean))
}

export function parseProbeResponse(xml: string): DiscoveryTarget | null {
  const eprMatch = xml.match(/<wsa:EndpointReference>[\s\S]*?<wsa:Address>([^<]+)<\/wsa:Address>/)
  const epr = eprMatch?.[1] ?? null
  const xaddrMatch = xml.match(/<d:XAddrs[^>]*>([^<]+)<\/d:XAddrs>/)
  const xaddrs = xaddrMatch?.[1] ?? ''

  if (!epr && !xaddrs) return null

  const addresses = xaddrs.split(' ').filter(Boolean)
  const types = decodeTypes(xml)
  const scopes = decodeScopes(xml)

  return { epr: epr ?? addresses[0] ?? '', addresses, types, scopes }
}

export class WsDiscoveryIngestor {
  private readonly seen = new Map<string, DiscoveryTarget>()

  ingest(xml: string): DiscoveryTarget | null {
    if (!xml.includes('ProbeMatches')) return null
    const target = parseProbeResponse(xml)
    if (!target) return null
    const key = target.epr || target.addresses[0] || ''
    if (!key) return null
    if (!this.seen.has(key)) {
      this.seen.set(key, target)
    }
    return target
  }

  results(): DiscoveryTarget[] {
    return [...this.seen.values()]
  }

  reset(): void {
    this.seen.clear()
  }
}

export class WsDiscoveryClient {
  private socket: ReturnType<typeof createSocket> | null = null
  private readonly ingestor = new WsDiscoveryIngestor()

  constructor(
    private readonly interfaceAddress: string,
    private readonly timeoutMs: number,
  ) {}

  async discover(): Promise<DiscoveryTarget[]> {
    this.ingestor.reset()
    return new Promise((resolve, reject) => {
      const socket = createSocket({ type: 'udp4', reuseAddr: true })
      this.socket = socket
      let finished = false

      const finish = (targets: DiscoveryTarget[]): void => {
        if (finished) return
        finished = true
        socket.close()
        resolve(targets)
      }

      const timer = setTimeout(() => finish(this.ingestor.results()), this.timeoutMs)

      socket.on('error', (error) => {
        if (finished) return
        clearTimeout(timer)
        socket.close()
        reject(error)
      })

      socket.on('message', (message) => {
        this.ingestor.ingest(message.toString('utf8'))
      })

      socket.bind(0, this.interfaceAddress, () => {
        socket.setMulticastTTL(1)
        socket.setMulticastLoopback(false)
        const probe = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"',
          ' xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"',
          ' xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"',
          ' xmlns:dn="http://www.onvif.org/ver10/network/wsdl">',
          '<e:Header><w:MessageID>uuid:1</w:MessageID><w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>',
          '<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>',
          '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>',
        ].join('')

        socket.send(probe, WS_DISCOVERY_PORT, WS_DISCOVERY_ADDRESS, () => {
          socket.send(probe, WS_DISCOVERY_PORT, WS_DISCOVERY_ADDRESS)
        })
      })
    })
  }

  abort(): void {
    this.socket?.close()
  }
}

export async function discoverOnInterface(
  interfaceAddress: string,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<DiscoveryTarget[]> {
  const client = new WsDiscoveryClient(interfaceAddress, options.timeoutMs)
  if (options.signal) {
    options.signal.addEventListener('abort', () => client.abort(), { once: true })
  }
  return client.discover()
}
