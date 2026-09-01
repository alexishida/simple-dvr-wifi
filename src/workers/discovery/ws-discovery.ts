import { createSocket } from 'node:dgram'
import { randomUUID } from 'node:crypto'

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
  const matches = [
    ...typesXml.matchAll(
      /<(?:[a-zA-Z0-9_-]+:)?Types[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?Types>/g,
    ),
  ]
  return matches.flatMap((m) => (m[1] ?? '').split(' ').filter(Boolean))
}

function decodeScopes(scopesXml: string): string[] {
  const matches = [
    ...scopesXml.matchAll(
      /<(?:[a-zA-Z0-9_-]+:)?Scopes[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?Scopes>/g,
    ),
  ]
  return matches.flatMap((m) => (m[1] ?? '').split(' ').filter(Boolean))
}

function parseProbeMatch(xml: string): DiscoveryTarget | null {
  const eprMatch = xml.match(
    /<(?:[a-zA-Z0-9_-]+:)?EndpointReference>[\s\S]*?<(?:[a-zA-Z0-9_-]+:)?Address>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?Address>/,
  )
  const epr = eprMatch?.[1] ?? null
  const xaddrMatch = xml.match(
    /<(?:[a-zA-Z0-9_-]+:)?XAddrs[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?XAddrs>/,
  )
  const xaddrs = xaddrMatch?.[1] ?? ''

  if (!epr && !xaddrs) return null

  const addresses = xaddrs.split(' ').filter(Boolean)
  const types = decodeTypes(xml)
  const scopes = decodeScopes(xml)

  return { epr: epr ?? addresses[0] ?? '', addresses, types, scopes }
}

export function parseProbeResponses(xml: string): DiscoveryTarget[] {
  const matches = [
    ...xml.matchAll(
      /<(?:[a-zA-Z0-9_-]+:)?ProbeMatch(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?ProbeMatch>/g,
    ),
  ]
  if (matches.length === 0) {
    const target = parseProbeMatch(xml)
    return target ? [target] : []
  }
  return matches
    .map((match) => parseProbeMatch(match[0]))
    .filter((target): target is DiscoveryTarget => target !== null)
}

export function parseProbeResponse(xml: string): DiscoveryTarget | null {
  return parseProbeResponses(xml)[0] ?? null
}

export class WsDiscoveryIngestor {
  private readonly seen = new Map<string, DiscoveryTarget>()

  ingest(xml: string): DiscoveryTarget | null {
    if (!xml.includes('ProbeMatches')) return null
    const targets = parseProbeResponses(xml)
    for (const target of targets) {
      const key = target.epr || target.addresses[0] || ''
      if (key && !this.seen.has(key)) {
        this.seen.set(key, target)
      }
    }
    return targets[0] ?? null
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
  private finishDiscovery: (() => void) | null = null
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
      const retryTimers: NodeJS.Timeout[] = []

      const finish = (targets: DiscoveryTarget[]): void => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        retryTimers.forEach(clearTimeout)
        this.finishDiscovery = null
        this.socket = null
        try {
          socket.close()
        } catch {
          // O socket pode ter sido fechado pelo sistema enquanto a busca era cancelada.
        }
        resolve(targets)
      }

      this.finishDiscovery = () => finish(this.ingestor.results())

      const timer = setTimeout(
        () => finish(this.ingestor.results()),
        this.timeoutMs,
      )

      socket.on('error', (error) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        retryTimers.forEach(clearTimeout)
        this.finishDiscovery = null
        this.socket = null
        try {
          socket.close()
        } catch {
          // O erro pode ocorrer depois que o socket já foi fechado.
        }
        reject(error)
      })

      socket.on('message', (message) => {
        this.ingestor.ingest(message.toString('utf8'))
      })

      socket.bind(0, this.interfaceAddress, () => {
        socket.setMulticastTTL(1)
        socket.setMulticastLoopback(false)
        socket.setMulticastInterface(this.interfaceAddress)

        const sendProbe = (): void => {
          if (finished) return
          const probe = buildProbeMessage()
          socket.send(probe, WS_DISCOVERY_PORT, WS_DISCOVERY_ADDRESS)
        }

        sendProbe()
        retryTimers.push(setTimeout(sendProbe, 250), setTimeout(sendProbe, 750))
      })
    })
  }

  abort(): void {
    this.finishDiscovery?.()
  }
}

function buildProbeMessage(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"',
    ' xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"',
    ' xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"',
    ' xmlns:dn="http://www.onvif.org/ver10/network/wsdl">',
    `<e:Header><w:MessageID>urn:uuid:${randomUUID()}</w:MessageID>`,
    '<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>',
    '<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>',
    '<w:ReplyTo><w:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</w:Address></w:ReplyTo>',
    '</e:Header>',
    '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>',
  ].join('')
}

export async function discoverOnInterface(
  interfaceAddress: string,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<DiscoveryTarget[]> {
  const client = new WsDiscoveryClient(interfaceAddress, options.timeoutMs)
  if (options.signal?.aborted) return []
  const abort = (): void => client.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    return await client.discover()
  } finally {
    options.signal?.removeEventListener('abort', abort)
  }
}
