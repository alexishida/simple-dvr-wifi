import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { z } from 'zod'
import { failure, success, type Result } from '../../shared/contracts.js'
import { sanitizeSidecarOutput } from '../logging/sanitizer.js'

export const MAX_IPC_PAYLOAD_BYTES = 16 * 1024

export type IpcDefinition<TInput extends z.ZodType, TOutput> = {
  input: TInput
  maxPayloadBytes?: number
  handle: (input: z.infer<TInput>) => Promise<TOutput> | TOutput
}

export const EmptyRequestSchema = z.undefined()

export class IpcRegistry {
  private readonly handlers = new Map<string, IpcDefinition<z.ZodType, unknown>>()

  constructor(
    private readonly ipc: IpcMain,
    private readonly getMainWindow: () => WebContents | undefined,
  ) {}

  register<TInput extends z.ZodType, TOutput>(
    channel: string,
    definition: IpcDefinition<TInput, TOutput>,
  ): void {
    if (this.handlers.has(channel)) {
      throw new Error(`IPC channel already registered: ${channel}`)
    }
    this.handlers.set(channel, definition as IpcDefinition<z.ZodType, unknown>)
    this.ipc.handle(channel, (event, payload) => this.invoke(channel, event, payload))
  }

  has(channel: string): boolean {
    return this.handlers.has(channel)
  }

  isTrustedSender(event: IpcMainInvokeEvent): boolean {
    const window = this.getMainWindow()
    if (!window) return false
    return event.sender.id === window.id && event.senderFrame === event.sender.mainFrame
  }

  isPayloadWithinLimit(payload: unknown, maxBytes = MAX_IPC_PAYLOAD_BYTES): boolean {
    try {
      return Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8') <= maxBytes
    } catch {
      return false
    }
  }

  async invoke(
    channel: string,
    event: IpcMainInvokeEvent,
    payload: unknown,
  ): Promise<Result<unknown>> {
    const definition = this.handlers.get(channel)
    if (!definition) {
      return failure('NOT_FOUND', 'Canal desconhecido.')
    }

    if (!this.isTrustedSender(event)) {
      return failure('AUTH_ERROR', 'Solicitação não autorizada.')
    }

    if (!this.isPayloadWithinLimit(payload, definition.maxPayloadBytes)) {
      return failure('VALIDATION_ERROR', 'Solicitação inválida.')
    }

    const parsed = definition.input.safeParse(payload)
    if (!parsed.success) {
      return failure('VALIDATION_ERROR', 'Solicitação inválida.')
    }

    try {
      const value = await definition.handle(parsed.data as never)
      return success(value)
    } catch (error) {
      const message =
        error instanceof Error
          ? sanitizeSidecarOutput(error.message).slice(0, 500)
          : 'Não foi possível concluir a solicitação.'
      return failure('INTERNAL_ERROR', message || 'Não foi possível concluir a solicitação.')
    }
  }
}
