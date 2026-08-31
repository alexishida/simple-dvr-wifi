import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInside, resolveRenderAsset } from '../src/main/security/paths.js'

const root = 'C:\\app\\out\\renderer'

function staysInside(candidate: string | null): boolean {
  return candidate !== null && isPathInside(root, candidate)
}

describe('render asset resolution', () => {
  it('resolves the root document and nested assets', () => {
    expect(resolveRenderAsset(root, 'app://renderer/index.html')).toBe(
      'C:\\app\\out\\renderer\\index.html',
    )
    expect(resolveRenderAsset(root, 'app://renderer/assets/app.js')).toBe(
      'C:\\app\\out\\renderer\\assets\\app.js',
    )
  })

  it('never resolves outside the packaged root even with raw parent segments', () => {
    expect(staysInside(resolveRenderAsset(root, 'app://renderer/../secret.txt'))).toBe(true)
    expect(staysInside(resolveRenderAsset(root, 'app://renderer/a/../../secret.txt'))).toBe(true)
    expect(staysInside(resolveRenderAsset(root, 'app://renderer/%2e%2e/secret.txt'))).toBe(true)
    expect(staysInside(resolveRenderAsset(root, 'app://renderer/a/%2e%2e/%2e%2e/secret.txt'))).toBe(
      true,
    )
  })

  it('rejects encoded path traversal attempts', () => {
    expect(resolveRenderAsset(root, 'app://renderer/..%2Fsecret.txt')).toBeNull()
    expect(resolveRenderAsset(root, 'app://renderer/..%5Csecret.txt')).toBeNull()
    expect(resolveRenderAsset(root, 'app://renderer/%2e%2e%5Csecret.txt')).toBeNull()
    expect(resolveRenderAsset(root, 'app://renderer/a/%2e%2e%2F%2e%2e%2Fsecret.txt')).toBeNull()
  })

  it('rejects absolute escape paths outside the root', () => {
    expect(resolveRenderAsset(root, 'app://renderer/C:/windows/system32')).toBeNull()
    expect(resolveRenderAsset(root, 'app://renderer/C:%5Cwindows%5Csystem32')).toBeNull()
  })

  it('keeps a UNC-like or rooted path inside the packaged root', () => {
    expect(staysInside(resolveRenderAsset(root, 'app://renderer//etc/passwd'))).toBe(true)
  })

  it('rejects unknown hosts, query strings and hashes', () => {
    expect(resolveRenderAsset(root, 'app://evil/index.html')).toBeNull()
    expect(resolveRenderAsset(root, 'app://renderer/index.html?token=1')).toBeNull()
    expect(resolveRenderAsset(root, 'app://renderer/index.html#section')).toBeNull()
  })

  it('rejects malformed URLs and bad encodings', () => {
    expect(resolveRenderAsset(root, 'not-a-url')).toBeNull()
    expect(resolveRenderAsset(root, 'app://renderer/%')).toBeNull()
  })

  it('does not leak files outside the root', () => {
    expect(isPathInside(root, 'C:\\app\\out\\renderer')).toBe(false)
    expect(isPathInside(root, 'C:\\app\\out\\renderer\\index.html')).toBe(true)
    expect(isPathInside(root, 'C:\\app\\out\\other\\file.txt')).toBe(false)
    expect(relative(root, 'C:\\app\\out\\other\\file.txt').startsWith('..')).toBe(true)
  })
})
