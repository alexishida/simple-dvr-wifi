import type { DbRequest, DbResponse } from '../../shared/database.js'
import type { SqliteWorker } from '../../workers/database/worker.js'

export interface DatabaseWorkerTransport {
  postMessage(request: DbRequest): void
  onMessage(callback: (response: DbResponse) => void): void
  onExit(callback: (code: number) => void): void
  kill(): void
}

type Pending = {
  resolve: (response: DbResponse) => void
  timer: NodeJS.Timeout
}

export class DatabaseSupervisor {
  private readonly pending = new Map<string, Pending>()
  private sequence = 0
  private closed = false

  constructor(private readonly transport: DatabaseWorkerTransport) {
    this.transport.onMessage((response) => this.resolve(response))
    this.transport.onExit(() => this.finishPending())
  }

  private unavailable(id: string): DbResponse {
    return {
      id,
      ok: false,
      error: {
        code: 'STORAGE_ERROR',
        message: 'Worker de banco indisponível.',
        retryable: false,
      },
    }
  }

  private finishPending(): void {
    this.closed = true
    for (const id of this.pending.keys()) this.resolve(this.unavailable(id))
  }

  private resolve(response: DbResponse): void {
    const entry = this.pending.get(response.id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(response.id)
    entry.resolve(response)
  }

  request(
    op: string,
    payload: unknown,
    timeoutMs = 5_000,
  ): Promise<DbResponse> {
    const id = `${++this.sequence}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    const request: DbRequest = { id, op, payload }
    if (this.closed) return Promise.resolve(this.unavailable(id))

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({
          id,
          ok: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Timeout do worker de banco.',
            retryable: true,
          },
        })
      }, timeoutMs)
      this.pending.set(id, { resolve, timer })
      try {
        this.transport.postMessage(request)
      } catch {
        this.resolve(this.unavailable(id))
      }
    })
  }

  async healthCheck(timeoutMs = 2_000): Promise<boolean> {
    const response = await this.request('health', undefined, timeoutMs)
    return (
      response.ok &&
      (response as { value?: { ready?: boolean } }).value?.ready === true
    )
  }

  async close(timeoutMs = 2_000): Promise<void> {
    await this.request('close', undefined, timeoutMs)
    this.finishPending()
  }

  async shutdown(timeoutMs = 2_000): Promise<void> {
    try {
      await this.close(timeoutMs)
    } finally {
      this.transport.kill()
    }
  }
}

export function createInMemoryTransport(
  worker: SqliteWorker,
): DatabaseWorkerTransport {
  const listeners: Array<(response: DbResponse) => void> = []
  let closed = false

  return {
    postMessage: (request) => {
      void worker
        .dispatch(request)
        .then((response) => {
          if (!closed) {
            for (const listener of listeners) listener(response)
          }
        })
        .catch(() => {
          if (!closed) {
            for (const listener of listeners) {
              listener({
                id: request.id,
                ok: false,
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'Falha do worker.',
                  retryable: false,
                },
              })
            }
          }
        })
    },
    onMessage: (callback) => listeners.push(callback),
    onExit: () => undefined,
    kill: () => {
      closed = true
      worker.close()
    },
  }
}
