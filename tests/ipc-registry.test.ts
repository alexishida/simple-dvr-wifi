import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { IpcRegistry } from '../src/main/ipc/registry.js'

type CapturedHandler = (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>

function makeFakeIpcMain(): { ipc: IpcMain; handlers: Map<string, CapturedHandler> } {
  const handlers = new Map<string, CapturedHandler>()
  const ipc = {
    handle: (channel: string, handler: CapturedHandler): void => {
      handlers.set(channel, handler)
    },
  } as unknown as IpcMain
  return { ipc, handlers }
}

function makeFakeEvent(id: number, frameOk = true): IpcMainInvokeEvent {
  const mainFrame = { id: 1 }
  const sender = { id, mainFrame } as unknown as WebContents
  return {
    sender,
    senderFrame: frameOk ? mainFrame : { id: 999 },
  } as unknown as IpcMainInvokeEvent
}

describe('IPC registry', () => {
  it('rejects an unknown channel', async () => {
    const { ipc, handlers } = makeFakeIpcMain()
    const registry = new IpcRegistry(ipc, () => undefined)
    registry.register('cameras:list', {
      input: z.undefined(),
      handle: () => [],
    })

    expect(registry.has('cameras:list')).toBe(true)
    expect(registry.has('unknown:channel')).toBe(false)
    expect(handlers.has('unknown:channel')).toBe(false)

    const result = await registry.invoke('unknown:channel', makeFakeEvent(1), undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('rejects an invalid sender', async () => {
    const { ipc } = makeFakeIpcMain()
    const mainWindow = { id: 1 } as unknown as WebContents
    const registry = new IpcRegistry(ipc, () => mainWindow)
    registry.register('cameras:list', {
      input: z.undefined(),
      handle: () => [],
    })

    const result = await registry.invoke('cameras:list', makeFakeEvent(2), undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('AUTH_ERROR')
  })

  it('rejects an oversized payload', async () => {
    const { ipc } = makeFakeIpcMain()
    const mainWindow = { id: 1 } as unknown as WebContents
    const registry = new IpcRegistry(ipc, () => mainWindow)
    registry.register('cameras:list', {
      input: z.undefined(),
      handle: () => [],
    })

    const huge = 'x'.repeat(20 * 1024)
    const result = await registry.invoke('cameras:list', makeFakeEvent(1), huge)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a payload that fails the schema', async () => {
    const { ipc } = makeFakeIpcMain()
    const mainWindow = { id: 1 } as unknown as WebContents
    const registry = new IpcRegistry(ipc, () => mainWindow)
    registry.register('shell:openExternal', {
      input: z.object({ url: z.string().min(1) }),
      handle: ({ url }) => ({ opened: url.length > 0 }),
    })

    const result = await registry.invoke('shell:openExternal', makeFakeEvent(1), { url: 42 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('maps handler exceptions to a safe internal error', async () => {
    const { ipc } = makeFakeIpcMain()
    const mainWindow = { id: 1 } as unknown as WebContents
    const registry = new IpcRegistry(ipc, () => mainWindow)
    registry.register('shell:openExternal', {
      input: z.object({ url: z.string().min(1) }),
      handle: () => {
        throw new Error('boom')
      },
    })

    const result = await registry.invoke('shell:openExternal', makeFakeEvent(1), { url: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INTERNAL_ERROR')
  })

  it('returns the handler result for a valid request', async () => {
    const { ipc } = makeFakeIpcMain()
    const mainWindow = { id: 1 } as unknown as WebContents
    const registry = new IpcRegistry(ipc, () => mainWindow)
    registry.register('shell:openExternal', {
      input: z.object({ url: z.string().min(1) }),
      handle: ({ url }) => ({ opened: url.startsWith('https://') }),
    })

    const result = await registry.invoke('shell:openExternal', makeFakeEvent(1), {
      url: 'https://example.com',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ opened: true })
  })
})
