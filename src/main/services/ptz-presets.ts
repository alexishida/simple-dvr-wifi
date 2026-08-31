import type { PtzCommandGuard } from '../../workers/camera/ptz-adapter.js'

export interface PtzPreset {
  token: string
  name: string
}

export interface PtzPresetCapabilities {
  list: boolean
  goto: boolean
  create: boolean
  remove: boolean
}

export class PtzPresetService {
  constructor(
    private readonly guard: PtzCommandGuard,
    private readonly profileToken: string,
    private readonly capabilities: PtzPresetCapabilities,
  ) {}

  async list(): Promise<PtzPreset[]> {
    if (!this.capabilities.list) return []
    try {
      return await this.guard.listPresets({ profileToken: this.profileToken })
    } catch (error) {
      if (error instanceof Error && error.message.includes('não suportada')) {
        return []
      }
      throw error
    }
  }

  async goto(presetToken: string): Promise<void> {
    if (!this.capabilities.goto) {
      throw new Error('Ir para preset não suportado.')
    }
    return this.guard.gotoPreset({ profileToken: this.profileToken, presetToken })
  }

  async create(name?: string): Promise<string> {
    if (!this.capabilities.create) {
      throw new Error('Criar preset não suportado.')
    }
    return this.guard.setPreset({ profileToken: this.profileToken, name })
  }

  async replace(presetToken: string): Promise<void> {
    if (!this.capabilities.create || !this.capabilities.goto) {
      throw new Error('Substituir preset não suportado.')
    }
    await this.guard.setPreset({ profileToken: this.profileToken, presetToken })
  }

  async remove(presetToken: string): Promise<void> {
    if (!this.capabilities.remove) {
      throw new Error('Remover preset não suportado.')
    }
    return this.guard.removePreset({ profileToken: this.profileToken, presetToken })
  }
}
