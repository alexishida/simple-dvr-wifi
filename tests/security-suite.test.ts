import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sanitizeSidecarOutput, sanitizeUrlCredentials } from '../src/main/logging/sanitizer.js'
import { resolveRenderAsset, isPathInside } from '../src/main/security/paths.js'
import { isSafeExternalUrl } from '../src/main/security/urls.js'
import {
  isAllowedNavigationUrl,
  PACKAGED_RENDERER_ORIGIN,
} from '../src/main/security/navigation-urls.js'
import { parseXmlSafe } from '../src/workers/camera/xml.js'
import { assertSafeArguments } from '../src/workers/media/ffmpeg-runner.js'
import { MAX_IPC_PAYLOAD_BYTES } from '../src/main/ipc/registry.js'

const CANARY_PASSWORD = 'canario-senha-secreta-xyz'
const CANARY_TOKEN = 'canario-token-abc-123'
const CANARY_URL_AUTH = 'http://canario-user:canario-pass@camera.local/stream'

async function collectTsSources(): Promise<string[]> {
  const roots = ['src/main', 'src/preload', 'src/renderer', 'src/shared', 'src/workers']
  const contents: string[] = []
  for (const root of roots) {
    await walkSource(root, contents)
  }
  return contents
}

async function walkSource(dir: string, out: string[]): Promise<void> {
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(await readFile(full, 'utf8'))
    }
  }
}

describe('security suite', () => {
  it('blocks navigation to external or malicious origins', () => {
    const origins = [PACKAGED_RENDERER_ORIGIN]
    expect(isAllowedNavigationUrl('app://renderer/index.html', origins)).toBe(true)
    expect(isAllowedNavigationUrl('https://evil.com', origins)).toBe(false)
    expect(isAllowedNavigationUrl('file:///C:/secret', origins)).toBe(false)
    expect(isAllowedNavigationUrl('javascript:alert(1)', origins)).toBe(false)
  })

  it('rejects unsafe external URLs for shell.openExternal', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('https://user:pass@host.com')).toBe(false)
  })

  it('confines renderer asset resolution', () => {
    const root = 'C:\\out\\renderer'
    expect(resolveRenderAsset(root, 'app://renderer/index.html')).toBe(
      'C:\\out\\renderer\\index.html',
    )
    // raw parent segments are normalized into the root by the URL parser; encoded escapes are rejected
    expect(isPathInside(root, resolveRenderAsset(root, 'app://renderer/../secret') ?? '')).toBe(
      true,
    )
    expect(resolveRenderAsset(root, 'app://renderer/..%2Fsecret')).toBeNull()
    expect(resolveRenderAsset(root, 'app://evil/index.html')).toBeNull()
  })

  it('rejects XXE and hostile XML', () => {
    expect(() =>
      parseXmlSafe('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>', {
        maxBytes: 1024,
        maxDepth: 4,
      }),
    ).toThrow()
    expect(() =>
      parseXmlSafe('<a><b><c><d>deep</d></c></b></a>', { maxBytes: 1024, maxDepth: 2 }),
    ).toThrow()
  })

  it('rejects shell metacharacters in FFmpeg arguments', () => {
    expect(() => assertSafeArguments(['rtsp://cam/x;rm -rf /'])).toThrow()
    expect(() => assertSafeArguments(['rtsp://cam/stream'])).not.toThrow()
  })

  it('rejects oversized IPC payloads', () => {
    expect(Buffer.byteLength('x'.repeat(MAX_IPC_PAYLOAD_BYTES + 1), 'utf8')).toBeGreaterThan(
      MAX_IPC_PAYLOAD_BYTES,
    )
  })

  it('never logs canary secrets through the sanitizer', () => {
    const fixture = `token=${CANARY_TOKEN} password=${CANARY_PASSWORD} url=${CANARY_URL_AUTH}`
    const output = sanitizeSidecarOutput(fixture)
    expect(output).not.toContain(CANARY_TOKEN)
    expect(output).not.toContain(CANARY_PASSWORD)
    expect(output).not.toContain('canario-user:canario-pass')
    expect(sanitizeUrlCredentials(CANARY_URL_AUTH)).not.toContain('canario-pass')
  })

  it('contains no canary secrets in source artifacts', async () => {
    const sources = await collectTsSources()
    const combined = sources.join('\n')
    expect(combined).not.toContain('canario-senha-secreta-xyz')
    expect(combined).not.toContain('canario-token-abc-123')
    expect(combined).not.toContain('canario-user:canario-pass')
  })
})
