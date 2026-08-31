import type { StreamProfile } from '../supervisors/stream-references.js'

export type ViewContext = 'grid' | 'fullscreen' | 'background' | 'hidden'

export interface ResourceState {
  context: ViewContext
  layoutSize: number
  windowMinimized: boolean
  recording: boolean
}

export interface ResourceDecision {
  profile: StreamProfile
  active: boolean
  reason: string
}

const GRID_THRESHOLD = 9

export function decideResourceState(state: ResourceState): ResourceDecision {
  if (state.windowMinimized) {
    if (state.recording) {
      return { profile: 'sub', active: true, reason: 'Minimizado; mantendo gravação em substream.' }
    }
    return { profile: 'sub', active: false, reason: 'Minimizado; stream suspenso para economia.' }
  }

  if (state.context === 'hidden') {
    if (state.recording) {
      return { profile: 'sub', active: true, reason: 'Item invisível; gravação preservada.' }
    }
    return { profile: 'sub', active: false, reason: 'Item invisível; stream liberado.' }
  }

  if (state.context === 'fullscreen') {
    return { profile: 'main', active: true, reason: 'Fullscreen usa main stream.' }
  }

  if (state.context === 'background') {
    return { profile: 'sub', active: true, reason: 'Em segundo plano usa substream.' }
  }

  // grid
  if (state.layoutSize >= GRID_THRESHOLD) {
    return { profile: 'sub', active: true, reason: 'Grid grande usa substream.' }
  }

  return { profile: 'sub', active: true, reason: 'Grid usa substream por padrão.' }
}

export function shouldKeepRecording(state: ResourceState): boolean {
  return state.recording
}

export function maxTranscodeBudget(layoutSize: number): number {
  if (layoutSize <= 1) return 2
  if (layoutSize <= 4) return 1
  return 0
}
