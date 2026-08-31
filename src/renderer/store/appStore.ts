import { create } from 'zustand'
import type { CameraSummary } from '../../shared/contracts.js'
import type { Unsubscribe } from '../../shared/events.js'

export type CameraMutation =
  | { kind: 'deactivate'; id: string }
  | { kind: 'reactivate'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'updateCredentials'; id: string }

export type FullscreenProfile = 'main' | 'sub'

interface PendingMutation {
  mutation: CameraMutation
  snapshot: CameraSummary | undefined
}

interface AppState {
  cameras: CameraSummary[]
  pendingMutations: PendingMutation[]
  hydrated: boolean
  fullscreenCamera: CameraSummary | null
  fullscreenProfile: FullscreenProfile
  setCameras: (cameras: CameraSummary[]) => void
  beginMutation: (mutation: CameraMutation) => void
  resolveMutation: (mutation: CameraMutation, success: boolean) => void
  openFullscreen: (camera: CameraSummary, profile: FullscreenProfile) => void
  closeFullscreen: () => void
  setFullscreenProfile: (profile: FullscreenProfile) => void
}

function applyMutation(cameras: CameraSummary[], mutation: CameraMutation): CameraSummary[] {
  switch (mutation.kind) {
    case 'deactivate':
      return cameras.map((c) => (c.id === mutation.id ? { ...c, status: 'disabled' as const } : c))
    case 'reactivate':
      return cameras.map((c) =>
        c.id === mutation.id ? { ...c, status: 'connecting' as const } : c,
      )
    case 'updateCredentials':
      return cameras.map((c) => (c.id === mutation.id ? { ...c, hasCredential: true } : c))
    case 'remove':
      return cameras.filter((c) => c.id !== mutation.id)
  }
}

function restoreSnapshot(
  cameras: CameraSummary[],
  mutation: CameraMutation,
  snapshot: CameraSummary | undefined,
): CameraSummary[] {
  if (snapshot) {
    return cameras.map((c) => (c.id === mutation.id ? snapshot : c))
  }
  // removed camera: reinsert the snapshot
  const existing = cameras.some((c) => c.id === mutation.id)
  if (!existing && snapshot) return [...cameras, snapshot]
  return cameras
}

function sameMutation(a: CameraMutation, b: CameraMutation): boolean {
  return a.kind === b.kind && a.id === b.id
}

export const useAppStore = create<AppState>((set) => ({
  cameras: [],
  pendingMutations: [],
  hydrated: false,
  fullscreenCamera: null,
  fullscreenProfile: 'main',

  setCameras: (cameras) => set({ cameras, hydrated: true }),

  beginMutation: (mutation) =>
    set((state) => {
      const snapshot = state.cameras.find((c) => c.id === mutation.id)
      return {
        pendingMutations: [...state.pendingMutations, { mutation, snapshot }],
        cameras: applyMutation(state.cameras, mutation),
      }
    }),

  resolveMutation: (mutation, success) =>
    set((state) => {
      const entry = state.pendingMutations.find((pending) =>
        sameMutation(pending.mutation, mutation),
      )
      const remaining = state.pendingMutations.filter(
        (pending) => !sameMutation(pending.mutation, mutation),
      )
      if (success) {
        return { pendingMutations: remaining }
      }
      // rollback visual: restaura o estado pré-mutação
      return {
        pendingMutations: remaining,
        cameras: restoreSnapshot(state.cameras, mutation, entry?.snapshot),
      }
    }),

  openFullscreen: (camera, profile) =>
    set({ fullscreenCamera: camera, fullscreenProfile: profile }),

  closeFullscreen: () => set({ fullscreenCamera: null, fullscreenProfile: 'main' }),

  setFullscreenProfile: (profile) => set({ fullscreenProfile: profile }),
}))

export function subscribeToCameraEvents(): Unsubscribe {
  return window.api.cameras.onChanged((cameras) => {
    useAppStore.getState().setCameras(cameras)
  })
}

export async function runCameraMutation(mutation: CameraMutation): Promise<boolean> {
  const store = useAppStore.getState()
  store.beginMutation(mutation)
  let ok = false
  switch (mutation.kind) {
    case 'deactivate':
      ok = (await window.api.cameras.deactivate(mutation.id)).ok
      break
    case 'reactivate':
      ok = (await window.api.cameras.reactivate(mutation.id)).ok
      break
    case 'updateCredentials':
      ok = (await window.api.cameras.updateCredentials({ id: mutation.id })).ok
      break
    case 'remove':
      ok = (await window.api.cameras.remove(mutation.id)).ok
      break
  }
  store.resolveMutation(mutation, ok)
  return ok
}
