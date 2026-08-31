import type { CameraSummary } from './contracts.js'

export const EVENT_CHANNELS = ['cameras:changed'] as const

export type EventChannel = (typeof EVENT_CHANNELS)[number]

export type EventPayloadMap = {
  'cameras:changed': CameraSummary[]
}

export type EventListener<C extends EventChannel> = (payload: EventPayloadMap[C]) => void

export type Unsubscribe = () => void
