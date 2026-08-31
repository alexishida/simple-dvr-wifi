import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl } from '../src/main/security/urls.js'

describe('external URL validation', () => {
  it('accepts public http and https URLs', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true)
    expect(isSafeExternalUrl('http://example.com/path')).toBe(true)
  })

  it('rejects non-http schemes', () => {
    expect(isSafeExternalUrl('file:///C:/secret.txt')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>x</script>')).toBe(false)
    expect(isSafeExternalUrl('app://renderer/index.html')).toBe(false)
    expect(isSafeExternalUrl('smb://host/share')).toBe(false)
  })

  it('rejects loopback and local destinations', () => {
    expect(isSafeExternalUrl('http://localhost:8080')).toBe(false)
    expect(isSafeExternalUrl('http://127.0.0.1')).toBe(false)
    expect(isSafeExternalUrl('http://[::1]')).toBe(false)
  })

  it('rejects URLs with embedded credentials', () => {
    expect(isSafeExternalUrl('https://user:pass@example.com')).toBe(false)
    expect(isSafeExternalUrl('https://token@example.com')).toBe(false)
  })

  it('rejects malformed or empty URLs', () => {
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
    expect(isSafeExternalUrl('https://')).toBe(false)
  })
})
