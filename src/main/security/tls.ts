import { createHash } from 'node:crypto'

export interface TlsFingerprintStore {
  getFingerprint(cameraId: string): string | null
  setFingerprint(cameraId: string, fingerprint: string): void
}

export interface TlsApproval {
  cameraId: string
  fingerprint: string
  approvedAt: string
}

export class InMemoryTlsFingerprintStore implements TlsFingerprintStore {
  private readonly fingerprints = new Map<string, string>()

  getFingerprint(cameraId: string): string | null {
    return this.fingerprints.get(cameraId) ?? null
  }

  setFingerprint(cameraId: string, fingerprint: string): void {
    this.fingerprints.set(cameraId, fingerprint)
  }
}

export function computeFingerprint(certificatePem: string): string {
  const der = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '')
  return createHash('sha256').update(Buffer.from(der, 'base64')).digest('hex')
}

export class TlsExceptionManager {
  constructor(private readonly store: TlsFingerprintStore) {}

  hasException(cameraId: string, fingerprint: string): boolean {
    const stored = this.store.getFingerprint(cameraId)
    return stored !== null && stored === fingerprint
  }

  approve(cameraId: string, fingerprint: string): TlsApproval {
    this.store.setFingerprint(cameraId, fingerprint)
    return { cameraId, fingerprint, approvedAt: new Date().toISOString() }
  }

  evaluate(
    cameraId: string,
    certificatePem: string,
    options: { valid: boolean },
  ): { allow: boolean; reason: 'valid' | 'approved' | 'rejected' } {
    if (options.valid) {
      return { allow: true, reason: 'valid' }
    }

    const fingerprint = computeFingerprint(certificatePem)
    if (this.hasException(cameraId, fingerprint)) {
      return { allow: true, reason: 'approved' }
    }

    return { allow: false, reason: 'rejected' }
  }

  revoke(cameraId: string): void {
    this.store.setFingerprint(cameraId, '')
  }
}
