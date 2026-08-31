import type { DatabaseSupervisor } from '../supervisors/database.js'
import { Vault, type MasterKeyStore } from '../security/vault.js'
import type { EncryptedCredential } from '../../shared/database.js'

export type CredentialInput = { service: string; password: string }

export class CredentialService {
  private readonly vault: Vault

  constructor(
    private readonly database: DatabaseSupervisor,
    keyStore: MasterKeyStore,
  ) {
    this.vault = new Vault(keyStore)
  }

  async initialize(): Promise<{ available: boolean }> {
    await this.vault.initialize()
    return { available: this.vault.isAvailable }
  }

  get isAvailable(): boolean {
    return this.vault.isAvailable
  }

  private async requireVault(): Promise<void> {
    if (!this.vault.isAvailable || !this.vault.hasMasterKey()) {
      throw new Error('safeStorage indisponível: persistência de credenciais bloqueada.')
    }
  }

  async setCredential(cameraId: string, input: CredentialInput): Promise<{ stored: true }> {
    await this.requireVault()
    const credential = this.vault.encrypt(input.password)
    const response = await this.database.request('credential.set', {
      cameraId,
      service: input.service,
      ...credential,
    })
    if (!response.ok) {
      throw new Error('Não foi possível persistir a credencial.')
    }
    return { stored: true }
  }

  async getCredential(cameraId: string, service: string): Promise<string | null> {
    await this.requireVault()
    const response = await this.database.request('credential.get', { cameraId, service })
    if (!response.ok) return null
    const credential = response.value as EncryptedCredential
    return this.vault.decrypt(credential)
  }

  async hasCredential(cameraId: string): Promise<boolean> {
    const response = await this.database.request('credential.has', { cameraId })
    return response.ok
      ? Boolean((response.value as { ready?: boolean }).ready ?? response.value)
      : false
  }

  async listCredentialServices(cameraId: string): Promise<string[]> {
    const response = await this.database.request('credential.listServices', { cameraId })
    return response.ok ? (response.value as string[]) : []
  }

  async removeCredential(cameraId: string, service?: string): Promise<void> {
    await this.database.request('credential.remove', { cameraId, service })
  }

  async encryptedCredentialsForCamera(
    cameraId: string,
  ): Promise<Record<string, EncryptedCredential>> {
    const services = await this.listCredentialServices(cameraId)
    const entries = await Promise.all(
      services.map(async (service) => {
        const response = await this.database.request('credential.get', { cameraId, service })
        return [service, response.ok ? (response.value as EncryptedCredential) : null] as const
      }),
    )
    return Object.fromEntries(entries.filter(([, c]) => c !== null)) as Record<
      string,
      EncryptedCredential
    >
  }
}
