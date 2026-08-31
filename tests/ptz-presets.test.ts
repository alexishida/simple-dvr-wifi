import { describe, expect, it } from 'vitest'
import { PtzPresetService, type PtzPresetCapabilities } from '../src/main/services/ptz-presets.js'
import { PtzCommandGuard, type PtzServiceInterface } from '../src/workers/camera/ptz-adapter.js'

function adapter(): { service: PtzServiceInterface; calls: string[] } {
  const calls: string[] = []
  const service: PtzServiceInterface = {
    continuousMove: async () => undefined,
    stop: async () => undefined,
    relativeMove: async () => undefined,
    absoluteMove: async () => undefined,
    listPresets: async () => {
      calls.push('list')
      return [
        { token: 'p1', name: 'Entrada' },
        { token: 'p2', name: 'Portão' },
      ]
    },
    gotoPreset: async () => void calls.push('goto'),
    setPreset: async () => {
      calls.push('set')
      return 'p-new'
    },
    removePreset: async () => void calls.push('remove'),
  }
  return { service, calls }
}

const FULL: PtzPresetCapabilities = { list: true, goto: true, create: true, remove: true }

describe('PTZ preset service', () => {
  it('lists presets from the camera', async () => {
    const { service, calls } = adapter()
    const presets = new PtzPresetService(
      new PtzCommandGuard(
        {
          continuous: true,
          relative: false,
          absolute: false,
          zoom: true,
          stop: true,
          presets: { list: true, goto: true, create: false, remove: false },
        },
        service,
      ),
      'main',
      FULL,
    )
    const list = await presets.list()
    expect(list).toEqual([
      { token: 'p1', name: 'Entrada' },
      { token: 'p2', name: 'Portão' },
    ])
    expect(calls).toEqual(['list'])
  })

  it('creates, goes to, replaces and removes presets', async () => {
    const { service, calls } = adapter()
    const presets = new PtzPresetService(
      new PtzCommandGuard(
        {
          continuous: true,
          relative: false,
          absolute: false,
          zoom: true,
          stop: true,
          presets: { list: true, goto: true, create: true, remove: true },
        },
        service,
      ),
      'main',
      FULL,
    )

    const token = await presets.create('Fundo')
    expect(token).toBe('p-new')
    await presets.goto('p1')
    await presets.replace('p1')
    await presets.remove('p2')
    expect(calls).toEqual(['set', 'goto', 'set', 'remove'])
  })

  it('returns empty list when listing is unsupported', async () => {
    const { service } = adapter()
    const presets = new PtzPresetService(
      new PtzCommandGuard(
        {
          continuous: true,
          relative: false,
          absolute: false,
          zoom: true,
          stop: true,
          presets: { list: false, goto: false, create: false, remove: false },
        },
        service,
      ),
      'main',
      FULL,
    )
    expect(await presets.list()).toEqual([])
  })

  it('blocks unsupported preset operations', async () => {
    const { service, calls } = adapter()
    const partial: PtzPresetCapabilities = { list: true, goto: true, create: false, remove: false }
    const presets = new PtzPresetService(
      new PtzCommandGuard(
        {
          continuous: true,
          relative: false,
          absolute: false,
          zoom: true,
          stop: true,
          presets: { list: true, goto: true, create: false, remove: false },
        },
        service,
      ),
      'main',
      partial,
    )

    await expect(presets.create('x')).rejects.toThrow(/não suportado/)
    await expect(presets.remove('p1')).rejects.toThrow(/não suportado/)
    await expect(presets.goto('p1')).resolves.toBeUndefined()
    expect(calls).toEqual(['goto'])
  })

  it('blocks goto when unsupported even with full preset object', async () => {
    const { service } = adapter()
    const presets = new PtzPresetService(
      new PtzCommandGuard(
        {
          continuous: true,
          relative: false,
          absolute: false,
          zoom: true,
          stop: true,
          presets: { list: true, goto: false, create: false, remove: false },
        },
        service,
      ),
      'main',
      { list: true, goto: false, create: false, remove: false },
    )
    await expect(presets.goto('p1')).rejects.toThrow(/não suportado/)
  })
})
