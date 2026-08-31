import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface Rgb {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

function luminance(color: Rgb): number {
  const channel = (value: number): number => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

function contrast(a: Rgb, b: Rgb): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (light + 0.05) / (dark + 0.05)
}

describe('design system tokens', () => {
  it('defines semantic color tokens in the stylesheet', async () => {
    const css = await readFile(new URL('../src/renderer/styles.css', import.meta.url), 'utf8')
    for (const token of [
      '--color-bg',
      '--color-surface',
      '--color-surface-raised',
      '--color-text',
      '--color-text-secondary',
      '--color-text-muted',
      '--color-accent',
      '--color-success',
      '--color-warning',
      '--color-danger',
      '--color-info',
    ]) {
      expect(css).toContain(token)
    }
    expect(css).toContain('color-scheme: dark')
  })

  it('keeps text contrast above 4.5:1 on the dark background', async () => {
    const bg = hexToRgb('#0d1117')
    const text = hexToRgb('#e6edf3')
    const secondary = hexToRgb('#9da7b3')
    const muted = hexToRgb('#7d8792')

    expect(contrast(text, bg)).toBeGreaterThan(7)
    expect(contrast(secondary, bg)).toBeGreaterThan(4.5)
    expect(contrast(muted, bg)).toBeGreaterThan(4.5)
  })

  it('defines spacing, radius and focus tokens', async () => {
    const css = await readFile(new URL('../src/renderer/styles.css', import.meta.url), 'utf8')
    for (const token of [
      '--space-1',
      '--space-4',
      '--space-8',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--focus-ring',
      '--transition-fast',
    ]) {
      expect(css).toContain(token)
    }
  })
})
