import { describe, expect, it } from 'vitest'
import {
  computeFingerprint,
  InMemoryTlsFingerprintStore,
  TlsExceptionManager,
} from '../src/main/security/tls.js'

const SELF_SIGNED_PEM =
  '-----BEGIN CERTIFICATE-----\n' +
  'MIIBzzCCAXagAwIBAgIULn0RVHmY8vFpDXNz9Z1n6pXgJjcwDQYJKoZIhvcNAQEL\n' +
  'BQAwEjEQMA4GA1UEAwwHY2FtLmxvY2FsMB4XDTI2MDEwMTAwMDAwMFoXDTI3MDEw\n' +
  'MTAwMDAwMFowEjEQMA4GA1UEAwwHY2FtLmxvY2FsMIGfMA0GCSqGSIb3DQEBAQUA\n' +
  'A4GNADCBiQKBgQC8mX5nX9z7uN7q0Yd5wJh0Zf7pA9T2V8rXn1xM9g0iQ4j9n9xP\n' +
  '0nKq1pA7G9mQpF3yX2Q6dQ1lQ2xZ4wY8gP7hVn5tK0bK8pO3yQ8dJ0nW2cH1\n' +
  'lQwIDAQABo1MwUTAdBgNVHQ4EFgQU9pB4uH4vZb3kE6sK7qZqM2YzH2swHwYDVR0j\n' +
  'BBgwFoAU9pB4uH4vZb3kE6sK7qZqM2YzH2swDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG\n' +
  '9w0BAQsFAAOBgQCMdGv0qC8gZ1d7r5pX9v0nY2wKf3zT7LqN0k4mN3Vj4yRf9eP\n' +
  '0JcX7tG5oQy1bN9zV8c6pQr3dHjF0sH4mG2Lw9nX5kR7p0q8d0Pw0m0nY3g2\n' +
  '-----END CERTIFICATE-----\n'

const OTHER_PEM = SELF_SIGNED_PEM.replace('MIIBzz', 'MIIBzzX')

describe('TLS exception manager', () => {
  it('rejects an invalid certificate before approval', () => {
    const manager = new TlsExceptionManager(new InMemoryTlsFingerprintStore())
    const result = manager.evaluate('camera-1', SELF_SIGNED_PEM, { valid: false })
    expect(result.allow).toBe(false)
    expect(result.reason).toBe('rejected')
  })

  it('accepts a valid certificate without exception', () => {
    const manager = new TlsExceptionManager(new InMemoryTlsFingerprintStore())
    const result = manager.evaluate('camera-1', SELF_SIGNED_PEM, { valid: true })
    expect(result.allow).toBe(true)
    expect(result.reason).toBe('valid')
  })

  it('accepts an invalid certificate after explicit approval', () => {
    const manager = new TlsExceptionManager(new InMemoryTlsFingerprintStore())
    const fingerprint = computeFingerprint(SELF_SIGNED_PEM)
    manager.approve('camera-1', fingerprint)

    const result = manager.evaluate('camera-1', SELF_SIGNED_PEM, { valid: false })
    expect(result.allow).toBe(true)
    expect(result.reason).toBe('approved')
  })

  it('requires a new decision when the certificate changes', () => {
    const manager = new TlsExceptionManager(new InMemoryTlsFingerprintStore())
    manager.approve('camera-1', computeFingerprint(SELF_SIGNED_PEM))

    const result = manager.evaluate('camera-1', OTHER_PEM, { valid: false })
    expect(result.allow).toBe(false)
    expect(result.reason).toBe('rejected')
  })

  it('does not allow exceptions for other cameras', () => {
    const manager = new TlsExceptionManager(new InMemoryTlsFingerprintStore())
    manager.approve('camera-1', computeFingerprint(SELF_SIGNED_PEM))

    const result = manager.evaluate('camera-2', SELF_SIGNED_PEM, { valid: false })
    expect(result.allow).toBe(false)
  })

  it('revokes an approval', () => {
    const manager = new TlsExceptionManager(new InMemoryTlsFingerprintStore())
    manager.approve('camera-1', computeFingerprint(SELF_SIGNED_PEM))
    manager.revoke('camera-1')

    const result = manager.evaluate('camera-1', SELF_SIGNED_PEM, { valid: false })
    expect(result.allow).toBe(false)
  })
})
