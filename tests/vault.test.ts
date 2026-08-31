import { describe, expect, it } from 'vitest'
import { FakeMasterKeyStore, InMemoryMasterKeyStore, Vault } from '../src/main/security/vault.js'
import type { EncryptedCredential } from '../src/shared/database.js'

describe('vault encryption', () => {
  it('round-trips a secret through AES-256-GCM', async () => {
    const vault = new Vault(new FakeMasterKeyStore())
    await vault.initialize()

    const secret = 'senha-super-secreta-123'
    const credential = vault.encrypt(secret)
    expect(vault.decrypt(credential)).toBe(secret)
  })

  it('uses a unique nonce per operation', async () => {
    const vault = new Vault(new FakeMasterKeyStore())
    await vault.initialize()

    const first = vault.encrypt('mesmo-segredo')
    const second = vault.encrypt('mesmo-segredo')
    expect(first.nonce).not.toBe(second.nonce)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })

  it('detects tampered ciphertext', async () => {
    const vault = new Vault(new FakeMasterKeyStore())
    await vault.initialize()

    const credential = vault.encrypt('valor')
    const tampered: EncryptedCredential = {
      ...credential,
      ciphertext: Buffer.from(credential.ciphertext, 'base64')
        .map((byte) => (byte === 0 ? 1 : 0))
        .toString('base64'),
    }
    expect(() => vault.decrypt(tampered)).toThrow()
  })

  it('detects a tampered tag', async () => {
    const vault = new Vault(new FakeMasterKeyStore())
    await vault.initialize()

    const credential = vault.encrypt('valor')
    const tampered: EncryptedCredential = {
      ...credential,
      tag: Buffer.from(credential.tag, 'base64')
        .map((byte) => (byte === 0 ? 1 : 0))
        .toString('base64'),
    }
    expect(() => vault.decrypt(tampered)).toThrow()
  })

  it('rejects an incompatible key version', async () => {
    const vault = new Vault(new FakeMasterKeyStore())
    await vault.initialize()

    const credential = vault.encrypt('valor')
    expect(() => vault.decrypt({ ...credential, keyVersion: 99 })).toThrow()
  })

  it('never stores plaintext in the persisted credential', async () => {
    const vault = new Vault(new FakeMasterKeyStore())
    await vault.initialize()

    const secret = 'senha-canario-que-nao-pode-vazar'
    const credential = vault.encrypt(secret)
    const serialized = JSON.stringify(credential)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(Buffer.from(secret).toString('base64'))
  })
})

describe('vault availability (safeStorage)', () => {
  it('reports unavailable when the secure backend is missing', async () => {
    const store = new InMemoryMasterKeyStore()
    store.available = false
    const vault = new Vault(store)
    await vault.initialize()

    expect(vault.isAvailable).toBe(false)
    expect(vault.hasMasterKey()).toBe(false)
  })

  it('reports available and encrypts when the backend exists', async () => {
    const vault = new Vault(new InMemoryMasterKeyStore())
    await vault.initialize()

    expect(vault.isAvailable).toBe(true)
    expect(vault.hasMasterKey()).toBe(true)
    expect(vault.encrypt('x')).toBeTruthy()
  })
})
