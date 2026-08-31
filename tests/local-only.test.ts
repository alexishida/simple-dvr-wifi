import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

async function collectSourceFiles(): Promise<Array<{ path: string; content: string }>> {
  const roots = ['src/main', 'src/preload', 'src/renderer', 'src/shared', 'src/workers']
  const files: Array<{ path: string; content: string }> = []
  for (const root of roots) {
    await walk(root, files)
  }
  return files
}

async function walk(dir: string, out: Array<{ path: string; content: string }>): Promise<void> {
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      const content = await readFile(full, 'utf8')
      out.push({ path: full, content })
    }
  }
}

const TELEMETRY_MARKERS = [
  /https?:\/\/(?!127\.0\.0\.1|localhost|[a-z0-9.-]*\.local\b)[a-z0-9.-]+(?:\.com|\.net|\.io|\.dev|\.ai|\.app)\b/i,
  /analytics|telemetry|sentry|bugsnag|posthog|mixpanel|amplitude|newrelic/i,
  /autoUpdater|update\.electronjs\.org|auto-update|checkForUpdates/i,
]

describe('fully local operation', () => {
  it('contains no telemetry, analytics or auto-update calls', async () => {
    const files = await collectSourceFiles()
    for (const file of files) {
      for (const marker of TELEMETRY_MARKERS) {
        expect(file.content, `${file.path} matches ${marker}`).not.toMatch(marker)
      }
    }
  })

  it('only connects to loopback or camera-configured hosts', async () => {
    const files = await collectSourceFiles()
    const all = files.map((f) => f.content).join('\n')

    // URLs hardcoded in the app must be loopback-only (no public CDNs, no API hosts)
    const hardcodedUrls = all.match(/https?:\/\/[^'"`)\s]+/g) ?? []
    for (const url of hardcodedUrls) {
      const parsed = new URL(url)
      const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
      const isPlaceholder = /example\.com|example\.invalid|csp-probe/i.test(parsed.hostname)
      expect(`${url} deve ser loopback ou placeholder de teste`).toBeTruthy()
      if (!isPlaceholder) {
        expect(isLoopback, `${url} não é loopback`).toBe(true)
      }
    }
  })

  it('does not reference the network stack for privileged navigation', async () => {
    const files = await collectSourceFiles()
    const all = files.map((f) => f.content).join('\n')
    // No arbitrary net.createServer / https server binding
    expect(all).not.toMatch(/net\.createServer|https\.createServer|http\.createServer/)
  })
})
