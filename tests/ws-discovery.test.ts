import { describe, expect, it } from 'vitest'
import { parseProbeResponse, WsDiscoveryIngestor } from '../src/workers/discovery/ws-discovery.js'

const PROBE_A = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Body>
    <d:ProbeMatches>
      <d:ProbeMatch>
        <wsa:EndpointReference><wsa:Address>urn:uuid:aaaa</wsa:Address></wsa:EndpointReference>
        <d:Types>dn:NetworkVideoTransmitter</d:Types>
        <d:Scopes>onvif://www.onvif.org/type/video_encoder</d:Scopes>
        <d:XAddrs>http://192.168.1.100/onvif/device_service</d:XAddrs>
      </d:ProbeMatch>
    </d:ProbeMatches>
  </e:Body>
</e:Envelope>`

const PROBE_B = PROBE_A.replace('urn:uuid:aaaa', 'urn:uuid:bbbb').replace(
  'http://192.168.1.100',
  'http://192.168.1.101',
)

describe('WS-Discovery parsing and deduplication', () => {
  it('parses a probe match with EPR, XAddr and types', () => {
    const target = parseProbeResponse(PROBE_A)
    expect(target).not.toBeNull()
    expect(target?.epr).toBe('urn:uuid:aaaa')
    expect(target?.addresses).toEqual(['http://192.168.1.100/onvif/device_service'])
    expect(target?.types).toContain('dn:NetworkVideoTransmitter')
    expect(target?.scopes).toContain('onvif://www.onvif.org/type/video_encoder')
  })

  it('ignores non-ProbeMatches messages', () => {
    expect(parseProbeResponse('<xml>Hello</xml>')).toBeNull()
    const ingestor = new WsDiscoveryIngestor()
    expect(ingestor.ingest('<xml>Hello</xml>')).toBeNull()
    expect(ingestor.results()).toHaveLength(0)
  })

  it('deduplicates by EPR', () => {
    const ingestor = new WsDiscoveryIngestor()
    ingestor.ingest(PROBE_A)
    ingestor.ingest(PROBE_A)
    expect(ingestor.results()).toHaveLength(1)
  })

  it('keeps distinct targets', () => {
    const ingestor = new WsDiscoveryIngestor()
    ingestor.ingest(PROBE_A)
    ingestor.ingest(PROBE_B)
    expect(ingestor.results()).toHaveLength(2)
  })

  it('returns empty for no matches', () => {
    const ingestor = new WsDiscoveryIngestor()
    expect(ingestor.results()).toEqual([])
  })
})
