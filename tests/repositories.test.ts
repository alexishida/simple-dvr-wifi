import { describe, expect, it } from 'vitest'
import {
  CameraRepository,
  CredentialRepository,
  ProfileRepository,
  RecordingRepository,
  SnapshotRepository,
} from '../src/workers/database/repositories.js'
import { createTempDir, createTestWorker } from './helpers/database.js'

describe('repositories and entity lifecycle', () => {
  it('creates, updates, queries and deactivates a camera', () => {
    const dir = createTempDir()
    const worker = createTestWorker(`${dir}/repo.sqlite`)
    const db = worker.database as never
    const cameras = new CameraRepository(db)

    const camera = cameras.create({
      name: 'Entrada',
      host: 'cam.entrada.local',
      port: 80,
      endpoints: [
        { service: 'onvif', url: 'http://cam.entrada.local/onvif/device_service' },
        { service: 'rtsp', url: 'rtsp://cam.entrada.local/stream1' },
      ],
    })

    expect(camera.id).toBeTruthy()
    expect(camera.endpoints).toHaveLength(2)

    const fetched = cameras.getById(camera.id)
    expect(fetched?.name).toBe('Entrada')

    const updated = cameras.update(camera.id, { name: 'Portão' })
    expect(updated?.name).toBe('Portão')

    cameras.setStatus(camera.id, 'connected')
    expect(cameras.getById(camera.id)?.status).toBe('connected')

    expect(cameras.deactivate(camera.id)).toBe(true)
    expect(cameras.list()).toHaveLength(0)
    expect(cameras.list(true)).toHaveLength(1)

    worker.close()
  })

  it('stores and removes encrypted credentials per service', () => {
    const dir = createTempDir()
    const worker = createTestWorker(`${dir}/creds.sqlite`)
    const db = worker.database as never
    const cameras = new CameraRepository(db)
    const credentials = new CredentialRepository(db)

    const camera = cameras.create({ name: 'Cam', host: 'cam.local' })
    credentials.upsert(camera.id, 'onvif', {
      keyVersion: 1,
      ciphertext: 'c1',
      nonce: 'n1',
      tag: 't1',
    })
    credentials.upsert(camera.id, 'rtsp', {
      keyVersion: 1,
      ciphertext: 'c2',
      nonce: 'n2',
      tag: 't2',
    })

    expect(credentials.hasCredential(camera.id)).toBe(true)
    expect(credentials.listServices(camera.id)).toEqual(['onvif', 'rtsp'])
    expect(credentials.get(camera.id, 'onvif')).toMatchObject({ ciphertext: 'c1' })

    credentials.remove(camera.id, 'onvif')
    expect(credentials.listServices(camera.id)).toEqual(['rtsp'])

    credentials.remove(camera.id)
    expect(credentials.hasCredential(camera.id)).toBe(false)

    worker.close()
  })

  it('removes credentials in cascade with the camera', () => {
    const dir = createTempDir()
    const worker = createTestWorker(`${dir}/cascade.sqlite`)
    const db = worker.database as never
    const cameras = new CameraRepository(db)
    const credentials = new CredentialRepository(db)

    const camera = cameras.create({ name: 'Cam', host: 'cam.local' })
    credentials.upsert(camera.id, 'rtsp', { keyVersion: 1, ciphertext: 'c', nonce: 'n', tag: 't' })

    expect(cameras.remove(camera.id)).toBe(true)
    expect(credentials.hasCredential(camera.id)).toBe(false)
    expect(cameras.getById(camera.id)).toBeNull()

    worker.close()
  })

  it('replaces profiles atomically and records recordings and snapshots', () => {
    const dir = createTempDir()
    const worker = createTestWorker(`${dir}/profiles.sqlite`)
    const db = worker.database as never
    const cameras = new CameraRepository(db)
    const profiles = new ProfileRepository(db)
    const recordings = new RecordingRepository(db)
    const snapshots = new SnapshotRepository(db)

    const camera = cameras.create({ name: 'Cam', host: 'cam.local' })

    const saved = profiles.replaceAll(camera.id, [
      {
        token: 'main',
        name: 'Principal',
        streamType: 'main',
        codec: 'H264',
        width: 1920,
        height: 1080,
        fps: 30,
      },
      {
        token: 'sub',
        name: 'Secundário',
        streamType: 'sub',
        codec: 'H264',
        width: 640,
        height: 360,
        fps: 15,
      },
    ])
    expect(saved).toHaveLength(2)

    profiles.replaceAll(camera.id, [
      {
        token: 'sub',
        name: 'Secundário',
        streamType: 'sub',
        codec: 'H264',
        width: 640,
        height: 360,
        fps: 15,
      },
    ])
    expect(profiles.list(camera.id)).toHaveLength(1)

    const recording = recordings.create(camera.id)
    expect(recording.status).toBe('starting')
    const completed = recordings.complete(recording.id, 'completed')
    expect(completed?.status).toBe('completed')
    expect(completed?.durationMs).toBeGreaterThanOrEqual(0)

    const snapshot = snapshots.create(camera.id, 'D:\\media\\snap-1.jpg')
    expect(snapshots.list(camera.id)).toHaveLength(1)
    expect(snapshot.path).toContain('snap-1.jpg')

    worker.close()
  })
})
