import { describe, expect, it } from 'vitest'
import {
  normalizePtzVelocity,
  PtzVelocityValidationError,
  describeClamped,
  type PtzVelocity,
} from '../src/workers/camera/ptz-velocity.js'

const LIMITS = {
  pan: { min: -1, max: 1 },
  tilt: { min: -1, max: 1 },
  zoom: { min: 0, max: 1 },
}

describe('PTZ velocity validation', () => {
  it('accepts in-range velocities', () => {
    const result = normalizePtzVelocity({ pan: 0.5, tilt: -0.2, zoom: 0.3 }, LIMITS)
    expect(result).toEqual({ pan: 0.5, tilt: -0.2, zoom: 0.3, clamped: false })
  })

  it('clamps values above the maximum', () => {
    const result = normalizePtzVelocity({ pan: 1.5, zoom: 2 }, LIMITS)
    expect(result.pan).toBe(1)
    expect(result.zoom).toBe(1)
    expect(result.clamped).toBe(true)
  })

  it('clamps values below the minimum', () => {
    const result = normalizePtzVelocity({ pan: -2, tilt: -3 }, LIMITS)
    expect(result.pan).toBe(-1)
    expect(result.tilt).toBe(-1)
  })

  it('rejects NaN, Infinity and non-numbers from IPC', () => {
    expect(() => normalizePtzVelocity({ pan: Number.NaN } as PtzVelocity, LIMITS)).toThrow(
      PtzVelocityValidationError,
    )
    expect(() =>
      normalizePtzVelocity({ pan: Number.POSITIVE_INFINITY } as PtzVelocity, LIMITS),
    ).toThrow(PtzVelocityValidationError)
    expect(() => normalizePtzVelocity({ pan: 'x' as never }, LIMITS)).toThrow(
      PtzVelocityValidationError,
    )
  })

  it('rejects when all axes are absent', () => {
    expect(() => normalizePtzVelocity({}, LIMITS)).toThrow(PtzVelocityValidationError)
  })

  it('describes out-of-range axes', () => {
    expect(describeClamped({ pan: 5, tilt: -9 }, LIMITS)).toEqual([
      'pan fora da faixa [-1, 1]',
      'tilt fora da faixa [-1, 1]',
    ])
    expect(describeClamped({ pan: 0.5 }, LIMITS)).toEqual([])
  })
})
