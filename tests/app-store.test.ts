import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../src/renderer/store/appStore.js'
import type { CameraSummary } from '../src/shared/contracts.js'

function makeCamera(id: string, status: CameraSummary['status'] = 'connected'): CameraSummary {
  return {
    id,
    name: `Cam ${id}`,
    host: `${id}.local`,
    status,
    recordingStatus: 'idle',
    hasCredential: false,
    supportsPtz: false,
  }
}

beforeEach(() => {
  useAppStore.setState({
    cameras: [],
    pendingMutations: [],
    hydrated: false,
    fullscreenCamera: null,
    fullscreenProfile: 'main',
  })
})

describe('app store', () => {
  it('hydrates cameras from events', () => {
    const camera = makeCamera('cam-1')
    useAppStore.getState().setCameras([camera])
    expect(useAppStore.getState().cameras).toHaveLength(1)
    expect(useAppStore.getState().hydrated).toBe(true)
  })

  it('reconciles deactivate mutation optimistically', () => {
    useAppStore.getState().setCameras([makeCamera('cam-1')])
    useAppStore.getState().beginMutation({ kind: 'deactivate', id: 'cam-1' })
    expect(useAppStore.getState().cameras[0]?.status).toBe('disabled')
  })

  it('rolls back the visual state when a mutation fails', () => {
    useAppStore.getState().setCameras([makeCamera('cam-1')])
    useAppStore.getState().beginMutation({ kind: 'deactivate', id: 'cam-1' })
    expect(useAppStore.getState().cameras[0]?.status).toBe('disabled')

    useAppStore.getState().resolveMutation({ kind: 'deactivate', id: 'cam-1' }, false)
    expect(useAppStore.getState().cameras[0]?.status).toBe('connected')
    expect(useAppStore.getState().pendingMutations).toHaveLength(0)
  })

  it('keeps the optimistic state when a mutation succeeds', () => {
    useAppStore.getState().setCameras([makeCamera('cam-1')])
    useAppStore.getState().beginMutation({ kind: 'deactivate', id: 'cam-1' })
    useAppStore.getState().resolveMutation({ kind: 'deactivate', id: 'cam-1' }, true)
    expect(useAppStore.getState().cameras[0]?.status).toBe('disabled')
  })

  it('reconciles reactivate and remove mutations', () => {
    useAppStore.getState().setCameras([makeCamera('cam-1'), makeCamera('cam-2')])
    useAppStore.getState().beginMutation({ kind: 'remove', id: 'cam-1' })
    expect(useAppStore.getState().cameras.map((c) => c.id)).toEqual(['cam-2'])
  })

  it('manages fullscreen camera and profile', () => {
    const camera = makeCamera('cam-1')
    useAppStore.getState().openFullscreen(camera, 'main')
    expect(useAppStore.getState().fullscreenCamera?.id).toBe('cam-1')
    expect(useAppStore.getState().fullscreenProfile).toBe('main')

    useAppStore.getState().setFullscreenProfile('sub')
    expect(useAppStore.getState().fullscreenProfile).toBe('sub')

    useAppStore.getState().closeFullscreen()
    expect(useAppStore.getState().fullscreenCamera).toBeNull()
    expect(useAppStore.getState().fullscreenProfile).toBe('main')
  })
})
