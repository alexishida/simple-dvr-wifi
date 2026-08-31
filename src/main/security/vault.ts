import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import type { EncryptedCredential } from '../../shared/database.js'

export interface MasterKeyStore {
  isEncryptionAvailable(): boolean
  wrap(material: Buffer): Buffer
  unwrap(wrapped: Buffer): Buffer
}

export const MASTER_KEY_VERSION = 1
export const MASTER_KEY_BYTES = 32
export const NONCE_BYTES = 12

function encodeBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

function decodeBase64(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

export class Vault {
  private masterKey: Buffer | null = null

  constructor(private readonly keyStore: MasterKeyStore) {}

  get keyVersion(): number {
    return MASTER_KEY_VERSION
  }

  get isAvailable(): boolean {
    return this.keyStore.isEncryptionAvailable()
  }

  async initialize(): Promise<void> {
    if (!this.isAvailable) {
      this.masterKey = null
      return
    }
    this.masterKey = randomBytes(MASTER_KEY_BYTES)
  }

  hasMasterKey(): boolean {
    return this.masterKey !== null
  }

  unwrapMasterKey(wrappedKey: Buffer): Buffer {
    return this.keyStore.unwrap(wrappedKey)
  }

  setMasterKey(masterKey: Buffer): void {
    if (masterKey.length !== MASTER_KEY_BYTES) {
      throw new Error('Chave mestra deve ter 32 bytes.')
    }
    this.masterKey = masterKey
  }

  getMasterKey(): Buffer {
    if (!this.masterKey) {
      throw new Error('Vault não inicializado.')
    }
    return this.masterKey
  }

  wrappedMasterKey(): Buffer {
    if (!this.masterKey) {
      throw new Error('Vault não inicializado.')
    }
    return this.keyStore.wrap(this.masterKey)
  }

  encrypt(plaintext: string): EncryptedCredential {
    const key = this.getMasterKey()
    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
      keyVersion: MASTER_KEY_VERSION,
      ciphertext: encodeBase64(ciphertext),
      nonce: encodeBase64(nonce),
      tag: encodeBase64(tag),
    }
  }

  decrypt(credential: EncryptedCredential): string {
    const key = this.getMasterKey()
    if (credential.keyVersion !== MASTER_KEY_VERSION) {
      throw new Error('Versão de chave incompatível.')
    }
    const nonce = decodeBase64(credential.nonce)
    const tag = decodeBase64(credential.tag)
    const ciphertext = decodeBase64(credential.ciphertext)
    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }

  verifyTagIntegrity(credential: EncryptedCredential, expectedTag: Buffer): boolean {
    const actual = decodeBase64(credential.tag)
    return actual.length === expectedTag.length && timingSafeEqual(actual, expectedTag)
  }
}

export class SafeStorageMasterKeyStore implements MasterKeyStore {
  isEncryptionAvailable(): boolean {
    try {
      return this.safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  wrap(material: Buffer): Buffer {
    return this.safeStorage.encryptString(material.toString('base64'))
  }

  unwrap(wrapped: Buffer): Buffer {
    return Buffer.from(this.safeStorage.decryptString(wrapped), 'base64')
  }

  constructor(
    private readonly safeStorage: {
      isEncryptionAvailable(): boolean
      encryptString(plainText: string): Buffer
      decryptString(encrypted: Buffer): string
    },
  ) {}
}

export class InMemoryMasterKeyStore implements MasterKeyStore {
  available = true

  isEncryptionAvailable(): boolean {
    return this.available
  }

  wrap(material: Buffer): Buffer {
    return material
  }

  unwrap(wrapped: Buffer): Buffer {
    return wrapped
  }
}

export class FakeMasterKeyStore implements MasterKeyStore {
  available = true
  private readonly nonce = randomBytes(12)

  isEncryptionAvailable(): boolean {
    return this.available
  }

  wrap(material: Buffer): Buffer {
    const cipher = createCipheriv('aes-256-gcm', this.nonce, this.nonce)
    return Buffer.concat([cipher.update(material), cipher.final(), cipher.getAuthTag()])
  }

  unwrap(wrapped: Buffer): Buffer {
    const data = wrapped.subarray(0, wrapped.length - 16)
    const tag = wrapped.subarray(wrapped.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', this.nonce, this.nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()])
  }
}
