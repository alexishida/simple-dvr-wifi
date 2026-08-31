import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  fetchSnapshot,
  isPathInsideLibrary,
  saveSnapshot,
  SnapshotError,
} from '../src/main/services/snapshot.js'

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 0x42)])

describe('snapshot service', () => {
  it('fetches a valid JPEG and saves it with UTC metadata', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-snap-'))
    const buffer = await fetchSnapshot({
      url: 'http://cam.local/snap.jpg',
      fetchImpl: async () => ({
        status: 200,
        ok: true,
        arrayBuffer: async () =>
          JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.byteLength),
      }),
    })
    expect(buffer.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))

    const result = await saveSnapshot(buffer, { cameraId: 'cam-1', libraryRoot: dir })
    expect(result.bytes).toBe(JPEG.byteLength)
    expect(result.capturedAt).toMatch(/Z$/)
    expect(result.relativePath).toMatch(/^cam-1\/\d{4}-\d{2}-\d{2}\//)
  })

  it('rejects a non-image payload', async () => {
    await expect(
      fetchSnapshot({
        url: 'http://cam.local/not-image',
        fetchImpl: async () => ({
          status: 200,
          ok: true,
          arrayBuffer: async () => Buffer.from('hello world').buffer,
        }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TYPE' })
  })

  it('rejects authentication failures', async () => {
    await expect(
      fetchSnapshot({
        url: 'http://cam.local/snap.jpg',
        username: 'admin',
        password: 'x',
        fetchImpl: async () => ({
          status: 401,
          ok: false,
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      }),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('rejects oversized snapshots', async () => {
    const big = Buffer.alloc(40 * 1024 * 1024, 0x42)
    big.set(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 0)
    await expect(
      fetchSnapshot({
        url: 'http://cam.local/snap.jpg',
        fetchImpl: async () => ({
          status: 200,
          ok: true,
          arrayBuffer: async () =>
            big.buffer.slice(big.byteOffset, big.byteOffset + big.byteLength),
        }),
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('preserves a valid file when saving fails later', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-snap-'))
    const result = await saveSnapshot(JPEG, { cameraId: 'cam-1', libraryRoot: dir })
    expect(result.path).toBeTruthy()
  })

  it('confines paths to the library root', () => {
    const root = 'C:\\Media\\Snapshots'
    expect(isPathInsideLibrary(root, 'C:\\Media\\Snapshots\\cam-1\\2026-08-30\\a.jpg')).toBe(true)
    expect(isPathInsideLibrary(root, 'C:\\Windows\\a.jpg')).toBe(false)
    expect(isPathInsideLibrary(root, 'C:\\Media\\Snapshots\\..\\escape.jpg')).toBe(false)
  })

  it('maps network failures', async () => {
    await expect(
      fetchSnapshot({
        url: 'http://cam.local/snap.jpg',
        fetchImpl: async () => {
          throw new Error('network')
        },
      }),
    ).rejects.toBeInstanceOf(SnapshotError)
  })
})
