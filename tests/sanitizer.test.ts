import { describe, expect, it } from 'vitest'
import {
  sanitizeLine,
  sanitizeSidecarOutput,
  sanitizeUrlCredentials,
  sanitizeValue,
} from '../src/main/logging/sanitizer.js'

const CANARY_PASSWORD = 'senha-canario-123'
const CANARY_TOKEN = 'token-canario-xyz'
const CANARY_KEY = 'chave-privada-canario'
const CANARY_AUTH = 'Authorization: Bearer segredo-bearer-456'

describe('central sanitizer', () => {
  it('redacts password fields', () => {
    const input = `user password="${CANARY_PASSWORD}" conectou`
    const output = sanitizeLine(input)
    expect(output).not.toContain(CANARY_PASSWORD)
    expect(output).toContain('[REDACTED]')
  })

  it('redacts tokens, api keys and secrets', () => {
    const input = `token: "${CANARY_TOKEN}" api_key='abc' secret=${CANARY_KEY}`
    const output = sanitizeLine(input)
    expect(output).not.toContain(CANARY_TOKEN)
    expect(output).not.toContain(CANARY_KEY)
    expect(output).toContain('[REDACTED]')
  })

  it('redacts Authorization headers and bearer tokens', () => {
    const output = sanitizeLine(CANARY_AUTH)
    expect(output).not.toContain('segredo-bearer-456')
    expect(output).toContain('[REDACTED]')
  })

  it('redacts credentials embedded in URLs', () => {
    const input = `rtsp://usuario:${CANARY_PASSWORD}@camera.local/stream`
    const output = sanitizeUrlCredentials(input)
    expect(output).not.toContain(CANARY_PASSWORD)
    expect(output).not.toContain('usuario')
  })

  it('sanitizes sidecar output including URLs', () => {
    const input = `error connecting to rtsp://admin:${CANARY_PASSWORD}@10.0.0.9 token=${CANARY_TOKEN}`
    const output = sanitizeSidecarOutput(input)
    expect(output).not.toContain(CANARY_PASSWORD)
    expect(output).not.toContain(CANARY_TOKEN)
  })

  it('masks values entirely', () => {
    expect(sanitizeValue(CANARY_PASSWORD)).toBe('*'.repeat(CANARY_PASSWORD.length))
  })

  it('never leaks canary secrets', () => {
    const canaries = [CANARY_PASSWORD, CANARY_TOKEN, CANARY_KEY, 'segredo-bearer-456']
    const fixtures = [
      `pwd: "${CANARY_PASSWORD}"`,
      `token: "${CANARY_TOKEN}"`,
      `private_key: "${CANARY_KEY}"`,
      `authorization: "${CANARY_AUTH.split(': ')[1]}"`,
      `http://user:${CANARY_PASSWORD}@host`,
    ]
    for (const fixture of fixtures) {
      const output = sanitizeSidecarOutput(fixture)
      for (const secret of canaries) {
        expect(output).not.toContain(secret)
      }
    }
  })
})
