import { describe, expect, it } from 'vitest'
import {
  decideResourceState,
  maxTranscodeBudget,
  shouldKeepRecording,
} from '../src/workers/media/resource-policy.js'

describe('resource policy', () => {
  it('uses sub stream in grids and switches to main in fullscreen', () => {
    expect(
      decideResourceState({
        context: 'grid',
        layoutSize: 4,
        windowMinimized: false,
        recording: false,
      }).profile,
    ).toBe('sub')
    expect(
      decideResourceState({
        context: 'fullscreen',
        layoutSize: 1,
        windowMinimized: false,
        recording: false,
      }).profile,
    ).toBe('main')
  })

  it('uses sub stream in large grids', () => {
    expect(
      decideResourceState({
        context: 'grid',
        layoutSize: 16,
        windowMinimized: false,
        recording: false,
      }).profile,
    ).toBe('sub')
  })

  it('suspends streams when minimized without a recording', () => {
    const decision = decideResourceState({
      context: 'grid',
      layoutSize: 4,
      windowMinimized: true,
      recording: false,
    })
    expect(decision.active).toBe(false)
    expect(decision.profile).toBe('sub')
  })

  it('keeps a recording active even when minimized', () => {
    const decision = decideResourceState({
      context: 'grid',
      layoutSize: 4,
      windowMinimized: true,
      recording: true,
    })
    expect(decision.active).toBe(true)
    expect(decision.profile).toBe('sub')
  })

  it('liberates buffers for hidden items but preserves recording', () => {
    const hidden = decideResourceState({
      context: 'hidden',
      layoutSize: 4,
      windowMinimized: false,
      recording: false,
    })
    expect(hidden.active).toBe(false)

    const hiddenRecording = decideResourceState({
      context: 'hidden',
      layoutSize: 4,
      windowMinimized: false,
      recording: true,
    })
    expect(hiddenRecording.active).toBe(true)
    expect(
      shouldKeepRecording({
        context: 'hidden',
        layoutSize: 4,
        windowMinimized: false,
        recording: true,
      }),
    ).toBe(true)
  })

  it('limits transcode budget by layout size', () => {
    expect(maxTranscodeBudget(1)).toBe(2)
    expect(maxTranscodeBudget(4)).toBe(1)
    expect(maxTranscodeBudget(16)).toBe(0)
  })
})
