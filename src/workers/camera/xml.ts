export class XmlParseError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'DTD_NOT_ALLOWED'
      | 'ENTITY_NOT_ALLOWED'
      | 'TRUNCATED'
      | 'MAX_DEPTH'
      | 'MAX_BYTES'
      | 'MALFORMED',
  ) {
    super(message)
  }
}

export interface XmlNode {
  name: string
  attributes: Record<string, string>
  children: XmlNode[]
  text: string
}

export interface XmlParseOptions {
  maxBytes: number
  maxDepth: number
}

const ALLOWED_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
])

const DTD_PATTERN = /<!DOCTYPE|<!(?:ELEMENT|ATTLIST|ENTITY)/i
const ENTITY_REFERENCE_PATTERN = /&([a-zA-Z0-9#_-]+);/g

function decodeEntities(input: string): string {
  return input.replace(ENTITY_REFERENCE_PATTERN, (match, name: string) => {
    if (name.startsWith('#x')) {
      const code = Number.parseInt(name.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ALLOWED_ENTITIES.get(name) ?? match
  })
}

function splitAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([a-zA-Z_][\w:.-]*)\s*=\s*"([^"]*)"|([a-zA-Z_][\w:.-]*)\s*=\s*'([^']*)'/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    const key = match[1] ?? match[3]
    const value = match[2] ?? match[4] ?? ''
    if (key) attributes[key] = decodeEntities(value)
  }
  return attributes
}

class XmlParser {
  private readonly input: string
  private pos = 0

  constructor(
    input: string,
    private readonly maxDepth: number,
  ) {
    this.input = input
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos]!)) {
      this.pos++
    }
  }

  private expect(character: string): void {
    if (this.input[this.pos] !== character) {
      throw new XmlParseError(`Esperava "${character}" na posição ${this.pos}.`, 'MALFORMED')
    }
    this.pos++
  }

  private readTagName(): string {
    const start = this.pos
    while (this.pos < this.input.length && /[^\s/>]/.test(this.input[this.pos]!)) {
      this.pos++
    }
    if (start === this.pos) {
      throw new XmlParseError('Nome de tag vazio.', 'MALFORMED')
    }
    return this.input.slice(start, this.pos)
  }

  private localName(name: string): string {
    const colon = name.indexOf(':')
    return colon === -1 ? name : name.slice(colon + 1)
  }

  parse(): XmlNode {
    this.skipWhitespace()
    if (this.input.startsWith('<?xml', this.pos)) {
      const end = this.input.indexOf('?>', this.pos)
      if (end === -1) {
        throw new XmlParseError('Prolog não terminado.', 'TRUNCATED')
      }
      this.pos = end + 2
      this.skipWhitespace()
    }
    const node = this.parseElement(0)
    this.skipWhitespace()
    if (this.pos < this.input.length) {
      throw new XmlParseError('Conteúdo inesperado após o elemento raiz.', 'MALFORMED')
    }
    return node
  }

  private parseElement(depth: number): XmlNode {
    if (depth > this.maxDepth) {
      throw new XmlParseError('Profundidade máxima excedida.', 'MAX_DEPTH')
    }
    this.expect('<')

    if (this.input[this.pos] === '?') {
      throw new XmlParseError('Prolog no meio do documento.', 'MALFORMED')
    }
    if (this.input[this.pos] === '!') {
      throw new XmlParseError('Conteúdo de declaração não permitido.', 'DTD_NOT_ALLOWED')
    }
    if (this.input[this.pos] === '/') {
      throw new XmlParseError('Tag de fechamento sem abertura.', 'MALFORMED')
    }

    const name = this.localName(this.readTagName())
    this.skipWhitespace()

    let attributes: Record<string, string> = {}
    let selfClosing = false

    if (this.input[this.pos] === '>') {
      this.pos++
    } else if (this.input[this.pos] === '/' && this.input[this.pos + 1] === '>') {
      selfClosing = true
      this.pos += 2
    } else {
      const attrStart = this.pos
      while (this.pos < this.input.length && this.input[this.pos] !== '>') {
        if (this.input[this.pos] === '/' && this.input[this.pos + 1] === '>') break
        this.pos++
      }
      const rawAttrs = this.input.slice(attrStart, this.pos)
      attributes = splitAttributes(rawAttrs)
      this.skipWhitespace()
      if (this.input[this.pos] === '/' && this.input[this.pos + 1] === '>') {
        selfClosing = true
        this.pos += 2
      } else {
        this.expect('>')
      }
    }

    const node: XmlNode = { name, attributes, children: [], text: '' }

    if (selfClosing) return node

    let textBuffer = ''
    while (this.pos < this.input.length) {
      if (this.input[this.pos] === '<') {
        if (this.input[this.pos + 1] === '/') {
          break
        }
        if (textBuffer) {
          node.text += decodeEntities(textBuffer)
          textBuffer = ''
        }
        node.children.push(this.parseElement(depth + 1))
        continue
      }
      textBuffer += this.input[this.pos]
      this.pos++
    }

    if (textBuffer) {
      node.text += decodeEntities(textBuffer)
    }

    if (this.input[this.pos] === '<' && this.input[this.pos + 1] === '/') {
      this.pos += 2
      const closingName = this.localName(this.readTagName())
      this.skipWhitespace()
      this.expect('>')
      if (closingName !== name) {
        throw new XmlParseError(
          `Tag de fechamento "${closingName}" não corresponde a "${name}".`,
          'MALFORMED',
        )
      }
      return node
    }

    throw new XmlParseError(`Tag "${name}" não foi fechada.`, 'TRUNCATED')
  }
}

export function parseXmlSafe(input: string, options: XmlParseOptions): XmlNode {
  const withoutBom = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input

  if (Buffer.byteLength(withoutBom, 'utf8') > options.maxBytes) {
    throw new XmlParseError('Payload excede o limite de bytes.', 'MAX_BYTES')
  }

  if (DTD_PATTERN.test(withoutBom)) {
    throw new XmlParseError('DTD ou declaração de entidade não permitida.', 'DTD_NOT_ALLOWED')
  }

  return new XmlParser(withoutBom, options.maxDepth).parse()
}

export function queryText(node: XmlNode, path: string): string | null {
  const segments = path.split('/').filter(Boolean)
  let current = node
  for (const segment of segments) {
    const child = current.children.find((c) => c.name === segment)
    if (!child) return null
    current = child
  }
  return current.text || null
}

export function queryAll(node: XmlNode, path: string): XmlNode[] {
  const segments = path.split('/').filter(Boolean)
  let current = [node]
  for (const segment of segments) {
    current = current.flatMap((n) => n.children.filter((c) => c.name === segment))
  }
  return current
}
