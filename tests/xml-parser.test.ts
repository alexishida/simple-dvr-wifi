import { describe, expect, it } from 'vitest'
import { parseXmlSafe, queryAll, queryText } from '../src/workers/camera/xml.js'

const OPTIONS = { maxBytes: 16 * 1024, maxDepth: 8 }

describe('secure XML/SOAP parser', () => {
  it('parses a well-formed SOAP envelope', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
        <s:Body>
          <GetProfilesResponse>
            <Profiles token="main">
              <Name>Principal</Name>
            </Profiles>
          </GetProfilesResponse>
        </s:Body>
      </s:Envelope>`
    const node = parseXmlSafe(xml, OPTIONS)
    expect(node.name).toBe('Envelope')
    const profiles = queryAll(node, 'Body/GetProfilesResponse/Profiles')
    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.attributes.token).toBe('main')
    expect(queryText(profiles[0]!, 'Name')).toBe('Principal')
  })

  it('rejects XML with a DOCTYPE/DTD', () => {
    const xml = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
      <Envelope><Body>&xxe;</Body></Envelope>`
    expect(() => parseXmlSafe(xml, OPTIONS)).toThrowError(
      expect.objectContaining({ reason: 'DTD_NOT_ALLOWED' }),
    )
  })

  it('rejects internal entity declarations', () => {
    const xml = `<!ENTITY xxe "lol"><Envelope>&xxe;</Envelope>`
    expect(() => parseXmlSafe(xml, OPTIONS)).toThrowError(
      expect.objectContaining({ reason: 'DTD_NOT_ALLOWED' }),
    )
  })

  it('rejects truncated XML', () => {
    const xml = `<Envelope><Body><GetProfilesResponse>`
    expect(() => parseXmlSafe(xml, OPTIONS)).toThrowError(
      expect.objectContaining({ reason: 'TRUNCATED' }),
    )
  })

  it('rejects payloads over the byte limit', () => {
    const xml = `<Envelope>${'x'.repeat(1024)}</Envelope>`
    expect(() => parseXmlSafe(xml, { maxBytes: 100, maxDepth: 8 })).toThrowError(
      expect.objectContaining({ reason: 'MAX_BYTES' }),
    )
  })

  it('rejects excessive nesting depth', () => {
    const xml = `<a><b><c><d><e><f><g><h><i><j><k>deep</k></j></i></h></g></f></e></d></c></b></a>`
    expect(() => parseXmlSafe(xml, { maxBytes: 1024, maxDepth: 5 })).toThrowError(
      expect.objectContaining({ reason: 'MAX_DEPTH' }),
    )
  })

  it('rejects mismatched closing tags', () => {
    const xml = `<Envelope><Body></Different></Envelope>`
    expect(() => parseXmlSafe(xml, OPTIONS)).toThrowError(
      expect.objectContaining({ reason: 'MALFORMED' }),
    )
  })

  it('rejects entity expansion beyond allowed references', () => {
    const xml = `<Envelope>&custom;</Envelope>`
    const node = parseXmlSafe(xml, OPTIONS)
    // unknown entity kept as-is, never expanded to external content
    expect(node.text).toContain('&custom;')
  })

  it('decodes only standard entities', () => {
    const node = parseXmlSafe('<Envelope>a &amp; b &lt;c&gt;</Envelope>', OPTIONS)
    expect(node.text).toBe('a & b <c>')
  })

  it('treats unknown entity references without expansion', () => {
    const node = parseXmlSafe('<Envelope>&xxe;ok</Envelope>', OPTIONS)
    expect(node.text).toBe('&xxe;ok')
  })
})
