export interface PtzVelocity {
  pan?: number
  tilt?: number
  zoom?: number
}

export interface PtzVelocityLimits {
  pan: { min: number; max: number }
  tilt: { min: number; max: number }
  zoom: { min: number; max: number }
}

export interface NormalizedVelocity extends PtzVelocity {
  clamped: boolean
}

export class PtzVelocityValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PtzVelocityValidationError'
  }
}

const DEFAULT_LIMITS: PtzVelocityLimits = {
  pan: { min: -1, max: 1 },
  tilt: { min: -1, max: 1 },
  zoom: { min: -1, max: 1 },
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeAxis(
  raw: unknown,
  axis: 'pan' | 'tilt' | 'zoom',
  limits: PtzVelocityLimits,
): { value: number | null; clamped: boolean } {
  if (raw === undefined || raw === null) return { value: null, clamped: false }
  if (!isFiniteNumber(raw)) {
    throw new PtzVelocityValidationError(`Velocidade ${axis} deve ser um número finito.`)
  }

  const range = limits[axis]
  let value = raw
  let clamped = false
  if (value < range.min) {
    value = range.min
    clamped = true
  } else if (value > range.max) {
    value = range.max
    clamped = true
  }
  return { value, clamped }
}

export function normalizePtzVelocity(
  raw: PtzVelocity,
  limits: PtzVelocityLimits = DEFAULT_LIMITS,
): NormalizedVelocity {
  const pan = normalizeAxis(raw.pan, 'pan', limits)
  const tilt = normalizeAxis(raw.tilt, 'tilt', limits)
  const zoom = normalizeAxis(raw.zoom, 'zoom', limits)

  if (pan.value === null && tilt.value === null && zoom.value === null) {
    throw new PtzVelocityValidationError('Ao menos um eixo de velocidade é obrigatório.')
  }

  return {
    pan: pan.value ?? undefined,
    tilt: tilt.value ?? undefined,
    zoom: zoom.value ?? undefined,
    clamped: pan.clamped || tilt.clamped || zoom.clamped,
  }
}

export function describeClamped(raw: PtzVelocity, limits: PtzVelocityLimits): string[] {
  const messages: string[] = []
  for (const axis of ['pan', 'tilt', 'zoom'] as const) {
    const value = raw[axis]
    if (value === undefined || value === null || !Number.isFinite(value)) continue
    const range = limits[axis]
    if (value < range.min || value > range.max) {
      messages.push(`${axis} fora da faixa [${range.min}, ${range.max}]`)
    }
  }
  return messages
}
