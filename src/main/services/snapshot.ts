import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { extname, join, resolve, relative } from 'node:path'

export const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

export class SnapshotError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'FETCH_FAILED'
      | 'AUTH_FAILED'
      | 'INVALID_TYPE'
      | 'TOO_LARGE'
      | 'WRITE_FAILED'
      | 'NOT_ALLOWED',
  ) {
    super(message)
  }
}

export interface SnapshotFetchOptions {
  url: string
  username?: string | null
  password?: string | null
  timeoutMs?: number
  fetchImpl?: (
    url: string,
    init: RequestInit,
  ) => Promise<{
    status: number
    ok: boolean
    headers?: Record<string, string>
    body?: ReadableStream<Uint8Array> | null
    arrayBuffer(): Promise<ArrayBuffer>
  }>
}

export interface SnapshotSaveOptions {
  cameraId: string
  libraryRoot: string
  capturedAt?: string
}

export interface SnapshotSaveResult {
  path: string
  relativePath: string
  bytes: number
  capturedAt: string
}

export async function fetchSnapshot(
  options: SnapshotFetchOptions,
): Promise<Buffer> {
  const fetchImpl =
    options.fetchImpl ??
    (async (url, init) => {
      const response = await fetch(url, init)
      return {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        body: response.body,
        arrayBuffer: () => response.arrayBuffer(),
      }
    })

  const headers: Record<string, string> = {}
  if (options.username) {
    headers.Authorization = `Basic ${Buffer.from(`${options.username}:${options.password ?? ''}`).toString('base64')}`
  }

  const signal = AbortSignal.timeout(options.timeoutMs ?? 8_000)
  let response
  try {
    response = await fetchImpl(options.url, {
      method: 'GET',
      headers,
      signal,
    })
  } catch {
    throw new SnapshotError(
      'Falha ao acessar o endpoint de snapshot.',
      'FETCH_FAILED',
    )
  }

  if (response.status === 401 && options.username) {
    const challenge =
      response.headers?.['www-authenticate'] ??
      response.headers?.['WWW-Authenticate']
    if (challenge && /^Digest/i.test(challenge)) {
      const authorization = buildDigestAuthorization(
        challenge,
        new URL(options.url),
        options.username,
        options.password ?? '',
      )
      if (authorization) {
        await response.body?.cancel()
        response = await fetchImpl(options.url, {
          method: 'GET',
          headers: { Authorization: `Digest ${authorization}` },
          signal,
        })
      }
    }
  }

  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel()
    throw new SnapshotError('Autenticação rejeitada.', 'AUTH_FAILED')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new SnapshotError(
      `Endpoint respondeu com status ${response.status}.`,
      'FETCH_FAILED',
    )
  }

  const contentLength = Number(
    response.headers?.['content-length'] ??
      response.headers?.['Content-Length'],
  )
  if (contentLength > MAX_SNAPSHOT_BYTES) {
    await response.body?.cancel()
    throw new SnapshotError('Snapshot acima do limite de tamanho.', 'TOO_LARGE')
  }
  let buffer: Buffer
  if (response.body) {
    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let bytes = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_SNAPSHOT_BYTES) {
          throw new SnapshotError(
            'Snapshot acima do limite de tamanho.',
            'TOO_LARGE',
          )
        }
        chunks.push(Buffer.from(value))
      }
      buffer = Buffer.concat(chunks, bytes)
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  } else {
    buffer = Buffer.from(await response.arrayBuffer())
  }
  validateSnapshotBuffer(buffer)
  return buffer
}

function buildDigestAuthorization(
  challenge: string,
  url: URL,
  username: string,
  password: string,
): string | null {
  const realm = /realm="([^"]+)"/i.exec(challenge)?.[1]
  const nonce = /nonce="([^"]+)"/i.exec(challenge)?.[1]
  const opaque = /opaque="([^"]+)"/i.exec(challenge)?.[1]
  const qop = /qop="?([^",\s]+)/i.exec(challenge)?.[1]
  if (!realm || !nonce) return null
  const uri = `${url.pathname}${url.search}`
  const cnonce = randomBytes(8).toString('hex')
  const nc = '00000001'
  const md5 = (value: string): string =>
    createHash('md5').update(value).digest('hex')
  const ha1 = md5(`${username}:${realm}:${password}`)
  const ha2 = md5(`GET:${uri}`)
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`)
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ]
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`)
  if (opaque) parts.push(`opaque="${opaque}"`)
  return parts.join(', ')
}

function extensionFor(buffer: Buffer): string {
  return PNG_MAGIC.equals(buffer.subarray(0, 4)) ? '.png' : '.jpg'
}

export function validateSnapshotBuffer(buffer: Buffer): void {
  const magic = buffer.subarray(0, 4)
  const isJpeg = JPEG_MAGIC.equals(magic.subarray(0, 3))
  const isPng = PNG_MAGIC.equals(magic)
  if (!isJpeg && !isPng) {
    throw new SnapshotError('Tipo de imagem não permitido.', 'INVALID_TYPE')
  }
  if (buffer.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new SnapshotError('Snapshot acima do limite de tamanho.', 'TOO_LARGE')
  }
}

export function isPathInsideLibrary(
  libraryRoot: string,
  candidate: string,
): boolean {
  const fromRoot = relative(resolve(libraryRoot), resolve(candidate))
  return (
    fromRoot !== '' && !fromRoot.startsWith('..') && !fromRoot.includes(':')
  )
}

export async function saveSnapshot(
  buffer: Buffer,
  options: SnapshotSaveOptions,
): Promise<SnapshotSaveResult> {
  validateSnapshotBuffer(buffer)
  const ext = extensionFor(buffer)
  const capturedAt = options.capturedAt ?? new Date().toISOString()
  const date = capturedAt.slice(0, 10)
  const relativePath = join(options.cameraId, date, `${randomUUID()}${ext}`)
  const absolutePath = resolve(options.libraryRoot, relativePath)

  if (!isPathInsideLibrary(options.libraryRoot, absolutePath)) {
    throw new SnapshotError('Caminho fora da biblioteca.', 'NOT_ALLOWED')
  }

  await mkdir(resolve(options.libraryRoot, options.cameraId, date), {
    recursive: true,
  })
  try {
    await writeFile(absolutePath, buffer)
  } catch {
    throw new SnapshotError(
      'Não foi possível gravar o snapshot.',
      'WRITE_FAILED',
    )
  }

  return {
    path: absolutePath,
    relativePath: relativePath.replaceAll('\\', '/'),
    bytes: buffer.byteLength,
    capturedAt,
  }
}

export function validateExtension(rawPath: string): void {
  const ext = extname(rawPath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new SnapshotError(
      'Extensão de arquivo não permitida.',
      'INVALID_TYPE',
    )
  }
}
