import { describe, expect, it } from 'vitest'
import {
  PACKAGED_RENDERER_ORIGIN,
  devServerOrigin,
  isAllowedNavigationUrl,
} from '../src/main/security/navigation-urls.js'

describe('navigation blocking', () => {
  it('allows only the packaged renderer origin in production', () => {
    expect(isAllowedNavigationUrl('app://renderer/', [PACKAGED_RENDERER_ORIGIN])).toBe(true)
    expect(isAllowedNavigationUrl('app://renderer/index.html', [PACKAGED_RENDERER_ORIGIN])).toBe(
      true,
    )
  })

  it('rejects external, file, data and arbitrary app hosts', () => {
    const origins = [PACKAGED_RENDERER_ORIGIN]
    expect(isAllowedNavigationUrl('https://example.com', origins)).toBe(false)
    expect(isAllowedNavigationUrl('file:///C:/secret.txt', origins)).toBe(false)
    expect(isAllowedNavigationUrl('data:text/html,x', origins)).toBe(false)
    expect(isAllowedNavigationUrl('app://evil/', origins)).toBe(false)
    expect(isAllowedNavigationUrl('app://renderer.evil.com/', origins)).toBe(false)
    expect(isAllowedNavigationUrl('', origins)).toBe(false)
  })

  it('extracts the dev server origin for local development', () => {
    expect(devServerOrigin('http://localhost:5173')).toBe('http://localhost:5173')
    expect(devServerOrigin(undefined)).toBeNull()
    expect(devServerOrigin('not a url')).toBeNull()
  })
})
