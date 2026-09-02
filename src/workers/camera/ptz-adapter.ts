export type PtzCommandName = 'continuous' | 'relative' | 'absolute' | 'zoom' | 'stop' | 'presets'

export interface PtzCapabilities {
  continuous: boolean
  relative: boolean
  absolute: boolean
  zoom: boolean
  stop: boolean
  presets: { list: boolean; goto: boolean; create: boolean; remove: boolean }
}

export interface PtzServiceInterface {
  continuousMove(options: { profileToken: string; velocity: Record<string, number> }): Promise<void>
  stop(options: { profileToken: string; panTilt?: boolean; zoom?: boolean }): Promise<void>
  relativeMove(options: { profileToken: string; velocity: Record<string, number> }): Promise<void>
  absoluteMove(options: { profileToken: string; position: Record<string, number> }): Promise<void>
  listPresets(options: { profileToken: string }): Promise<Array<{ token: string; name: string }>>
  gotoPreset(options: { profileToken: string; presetToken: string }): Promise<void>
  setPreset(options: { profileToken: string; presetToken?: string; name?: string }): Promise<string>
  removePreset(options: { profileToken: string; presetToken: string }): Promise<void>
}

export class PtzCommandGuard {
  constructor(
    private readonly capabilities: PtzCapabilities,
    private readonly adapter: PtzServiceInterface,
  ) {}

  canExecute(command: PtzCommandName): boolean {
    switch (command) {
      case 'continuous':
        return this.capabilities.continuous
      case 'relative':
        return this.capabilities.relative
      case 'absolute':
        return this.capabilities.absolute
      case 'zoom':
        return this.capabilities.zoom
      case 'stop':
        return this.capabilities.stop
      case 'presets':
        return this.capabilities.presets.list || this.capabilities.presets.goto
    }
  }

  async continuousMove(options: {
    profileToken: string
    velocity: Record<string, number>
  }): Promise<void> {
    if (!this.capabilities.continuous) {
      throw new Error('ContinuousMove não suportado.')
    }
    return this.adapter.continuousMove(options)
  }

  async relativeMove(options: {
    profileToken: string
    velocity: Record<string, number>
  }): Promise<void> {
    if (!this.capabilities.relative) {
      throw new Error('RelativeMove não suportado.')
    }
    return this.adapter.relativeMove(options)
  }

  async absoluteMove(options: {
    profileToken: string
    position: Record<string, number>
  }): Promise<void> {
    if (!this.capabilities.absolute) {
      throw new Error('AbsoluteMove não suportado.')
    }
    return this.adapter.absoluteMove(options)
  }

  async stop(options: { profileToken: string; panTilt?: boolean; zoom?: boolean }): Promise<void> {
    if (!this.capabilities.stop) {
      throw new Error('Stop não suportado.')
    }
    return this.adapter.stop(options)
  }

  async listPresets(options: {
    profileToken: string
  }): Promise<Array<{ token: string; name: string }>> {
    if (!this.capabilities.presets.list) {
      throw new Error('Listagem de presets não suportada.')
    }
    return this.adapter.listPresets(options)
  }

  async gotoPreset(options: { profileToken: string; presetToken: string }): Promise<void> {
    if (!this.capabilities.presets.goto) {
      throw new Error('GotoPreset não suportado.')
    }
    return this.adapter.gotoPreset(options)
  }

  async setPreset(options: {
    profileToken: string
    presetToken?: string
    name?: string
  }): Promise<string> {
    if (!this.capabilities.presets.create) {
      throw new Error('Criação de presets não suportada.')
    }
    return this.adapter.setPreset(options)
  }

  async removePreset(options: { profileToken: string; presetToken: string }): Promise<void> {
    if (!this.capabilities.presets.remove) {
      throw new Error('Remoção de presets não suportada.')
    }
    return this.adapter.removePreset(options)
  }
}

export function ptzCapabilitiesFromOnvif(options: {
  ptzSupported: boolean
  continuous?: boolean
  relative?: boolean
  absolute?: boolean
  zoom?: boolean
  presetCapabilities?: Partial<PtzCapabilities['presets']>
}): PtzCapabilities {
  return {
    continuous: options.ptzSupported && (options.continuous ?? true),
    relative: options.ptzSupported && (options.relative ?? false),
    absolute: options.ptzSupported && (options.absolute ?? false),
    zoom: options.ptzSupported && (options.zoom ?? true),
    stop: options.ptzSupported,
    presets: {
      list: options.ptzSupported && (options.presetCapabilities?.list ?? true),
      goto: options.ptzSupported && (options.presetCapabilities?.goto ?? true),
      create: options.ptzSupported && (options.presetCapabilities?.create ?? false),
      remove: options.ptzSupported && (options.presetCapabilities?.remove ?? false),
    },
  }
}
