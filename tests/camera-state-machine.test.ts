import { describe, expect, it } from 'vitest'
import { CameraStateMachine } from '../src/main/supervisors/camera-state-machine.js'

describe('camera state machine', () => {
  it('moves from disabled through connecting to connected', () => {
    const sm = new CameraStateMachine('cam-1')
    expect(sm.current).toBe('disabled')

    expect(sm.transition({ type: 'enable' }).allowed).toBe(true)
    expect(sm.current).toBe('disconnected')

    expect(sm.transition({ type: 'connect_start' }).allowed).toBe(true)
    expect(sm.current).toBe('connecting')

    expect(sm.transition({ type: 'connect_success' }).allowed).toBe(true)
    expect(sm.current).toBe('connected')
  })

  it('maps failures to the correct status category', () => {
    const sm = new CameraStateMachine('cam-1')
    sm.transition({ type: 'enable' })
    sm.transition({ type: 'connect_start' })

    expect(sm.transition({ type: 'failure', category: 'authentication' }).allowed).toBe(true)
    expect(sm.current).toBe('auth_error')

    sm.transition({ type: 'reconnect_start' })
    sm.transition({ type: 'failure', category: 'codec' })
    expect(sm.current).toBe('codec_error')

    sm.transition({ type: 'reconnect_start' })
    sm.transition({ type: 'failure', category: 'storage' })
    expect(sm.current).toBe('unavailable')
  })

  it('reconnects after a network error', () => {
    const sm = new CameraStateMachine('cam-1')
    sm.transition({ type: 'enable' })
    sm.transition({ type: 'connect_start' })
    sm.transition({ type: 'connect_success' })

    sm.transition({ type: 'failure', category: 'network' })
    expect(sm.current).toBe('network_error')

    expect(sm.transition({ type: 'reconnect_start' }).allowed).toBe(true)
    expect(sm.current).toBe('reconnecting')

    expect(sm.transition({ type: 'connect_success' }).allowed).toBe(true)
    expect(sm.current).toBe('connected')
  })

  it('rejects invalid transitions', () => {
    const sm = new CameraStateMachine('cam-1')
    // disabled -> connecting is invalid
    expect(sm.transition({ type: 'connect_start' }).allowed).toBe(false)
    expect(sm.current).toBe('disabled')

    // connected -> enable is invalid
    sm.transition({ type: 'enable' })
    sm.transition({ type: 'connect_start' })
    sm.transition({ type: 'connect_success' })
    expect(sm.transition({ type: 'enable' }).allowed).toBe(false)
    expect(sm.current).toBe('connected')
  })

  it('ignores disable/re-enable and resets', () => {
    const sm = new CameraStateMachine('cam-1')
    sm.transition({ type: 'enable' })
    sm.transition({ type: 'connect_start' })
    sm.transition({ type: 'disable' })
    expect(sm.current).toBe('disabled')

    sm.transition({ type: 'enable' })
    expect(sm.current).toBe('disconnected')

    sm.reset()
    expect(sm.current).toBe('disabled')
  })

  it('returns a stable description', () => {
    const sm = new CameraStateMachine('cam-1')
    sm.transition({ type: 'enable' })
    expect(sm.describe()).toEqual({ cameraId: 'cam-1', status: 'disconnected' })
  })
})
