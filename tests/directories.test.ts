import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertWritableDirectory,
  DirectoryResolutionError,
  hasTraversalSegment,
  resolveAllowedDirectory,
} from '../src/main/security/directories.js'

describe('directory resolution security', () => {
  const root = 'C:\\Data\\Media'

  it('accepts a path inside an allowed root', () => {
    expect(resolveAllowedDirectory('C:\\Data\\Media\\recordings', [root])).toBe(
      'C:\\Data\\Media\\recordings',
    )
  })

  it('rejects path traversal', () => {
    expect(() => resolveAllowedDirectory('C:\\Data\\Media\\..\\..\\Windows', [root])).toThrow(
      DirectoryResolutionError,
    )
    expect(hasTraversalSegment('..\\secret')).toBe(true)
    expect(hasTraversalSegment('a/b/../c')).toBe(true)
    expect(hasTraversalSegment('media/snapshots')).toBe(false)
  })

  it('rejects paths outside allowed roots', () => {
    expect(() => resolveAllowedDirectory('C:\\Other\\folder', [root])).toThrow(
      DirectoryResolutionError,
    )
  })

  it('rejects empty paths', () => {
    expect(() => resolveAllowedDirectory('   ', [root])).toThrow(DirectoryResolutionError)
  })

  it('rejects a file in place of a directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-dir-'))
    const file = join(dir, 'file.txt')
    writeFileSync(file, 'x')

    await expect(assertWritableDirectory(file)).rejects.toMatchObject({
      code: 'NOT_A_DIRECTORY',
    })
  })

  it('rejects missing directories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-dir-'))
    await expect(assertWritableDirectory(join(dir, 'nao-existe'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('accepts an existing writable directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-dir-'))
    await expect(assertWritableDirectory(dir)).resolves.toBeUndefined()
  })
})
