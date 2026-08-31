import { describe, expect, it } from 'vitest'
import {
  ptzCapabilitiesFromOnvif,
  PtzCommandGuard,
  type PtzServiceInterface,
} from '../src/workers/camera/ptz-adapter.js'

function spyAdapter(): { adapter: PtzServiceInterface; calls: string[] } {
  const calls: string[] = []
  const adapter: PtzServiceInterface = {
    continuousMove: async () => void calls.push('continuousMove'),
    stop: async () => void calls.push('stop'),
    relativeMove: async () => void calls.push('relativeMove'),
    absoluteMove: async () => void calls.push('absoluteMove'),
    listPresets: async () => {
      calls.push('listPresets')
      return []
    },
    gotoPreset: async () => void calls.push('gotoPreset'),
    setPreset: async () => {
      calls.push('setPreset')
      return 'preset-1'
    },
    removePreset: async () => void calls.push('removePreset'),
  }
  return { adapter, calls }
}

const PROFILE = { profileToken: 'main' }

describe('PTZ command guard', () => {
  it('routes supported continuous commands to the adapter', async () => {
    const { adapter, calls } = spyAdapter()
    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: true }), adapter)

    await guard.continuousMove({ ...PROFILE, velocity: { pan: 0.5 } })
    await guard.stop(PROFILE)
    expect(calls).toEqual(['continuousMove', 'stop'])
  })

  it('blocks unsupported operations before reaching the adapter', async () => {
    const { adapter, calls } = spyAdapter()
    const caps = ptzCapabilitiesFromOnvif({
      ptzSupported: true,
      continuous: false,
      relative: false,
    })
    const guard = new PtzCommandGuard(caps, adapter)

    await expect(guard.continuousMove({ ...PROFILE, velocity: { pan: 0.5 } })).rejects.toThrow(
      /não suportado/,
    )
    await expect(guard.relativeMove({ ...PROFILE, velocity: { pan: 0.5 } })).rejects.toThrow(
      /não suportado/,
    )
    await expect(guard.absoluteMove({ ...PROFILE, position: { pan: 0, tilt: 0 } })).rejects.toThrow(
      /não suportado/,
    )
    expect(calls).toEqual([])
  })

  it('denies all control when the camera has no PTZ', async () => {
    const { adapter, calls } = spyAdapter()
    const guard = new PtzCommandGuard(ptzCapabilitiesFromOnvif({ ptzSupported: false }), adapter)

    expect(guard.canExecute('continuous')).toBe(false)
    expect(guard.canExecute('stop')).toBe(false)
    await expect(guard.continuousMove({ ...PROFILE, velocity: { pan: 0.5 } })).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('gates preset operations by capability', async () => {
    const { adapter, calls } = spyAdapter()
    const caps = ptzCapabilitiesFromOnvif({
      ptzSupported: true,
      presetCapabilities: { list: true, goto: true, create: false, remove: true },
    })
    const guard = new PtzCommandGuard(caps, adapter)

    await expect(guard.listPresets(PROFILE)).resolves.toEqual([])
    await expect(guard.gotoPreset({ ...PROFILE, presetToken: 'p1' })).resolves.toBeUndefined()
    await expect(guard.setPreset(PROFILE)).rejects.toThrow(/Criação de presets não suportada/)
    await expect(guard.removePreset({ ...PROFILE, presetToken: 'p1' })).resolves.toBeUndefined()
    expect(calls).toEqual(['listPresets', 'gotoPreset', 'removePreset'])
  })
})
