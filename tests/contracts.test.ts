import { describe, expect, it } from 'vitest'
import { CameraSummarySchema, ResultSchema } from '../src/shared/contracts.js'

describe('shared contracts', () => {
  it('accepts a renderer-safe camera summary', () => {
    const parsed = CameraSummarySchema.parse({
      id: '7a940148-c2a2-4b90-8737-704a669215df',
      name: 'Entrada',
      host: 'camera.local',
      status: 'connected',
      recordingStatus: 'idle',
      hasCredential: true,
      supportsPtz: false,
    })

    expect(parsed).not.toHaveProperty('password')
  })

  it('rejects an invalid camera port', () => {
    expect(() =>
      CameraSummarySchema.parse({
        id: '7a940148-c2a2-4b90-8737-704a669215df',
        name: 'Entrada',
        host: 'camera.local',
        status: 'connected',
        recordingStatus: 'idle',
        hasCredential: true,
        supportsPtz: false,
        port: 70_000,
      }),
    ).toThrow()
  })

  it('serializes a typed failure envelope', () => {
    const Result = ResultSchema(CameraSummarySchema.array())
    expect(
      Result.parse({
        ok: false,
        error: { code: 'NETWORK_ERROR', message: 'Sem resposta', retryable: true },
      }),
    ).toEqual({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'Sem resposta', retryable: true },
    })
  })
})
