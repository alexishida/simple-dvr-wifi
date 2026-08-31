import type { DatabaseSupervisor } from '../supervisors/database.js'
import {
  CONFIG_DEFAULTS,
  parseConfig,
  serializeConfig,
  type AppConfig,
} from '../../shared/config.js'

const CONFIG_KEY = 'app.config'

export class ConfigRepository {
  constructor(private readonly database: DatabaseSupervisor) {}

  async load(): Promise<AppConfig> {
    const response = await this.database.request('preference.get', { key: CONFIG_KEY })
    if (!response.ok || response.value === null) {
      return { ...CONFIG_DEFAULTS }
    }
    return parseConfig(response.value as string)
  }

  async save(config: AppConfig): Promise<void> {
    const response = await this.database.request('preference.set', {
      key: CONFIG_KEY,
      value: serializeConfig(config),
    })
    if (!response.ok) {
      throw new Error('Não foi possível persistir a configuração.')
    }
  }
}
