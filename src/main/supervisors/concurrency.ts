export interface ConcurrencyOptions {
  limit: number
  signal?: AbortSignal
}

export class ConcurrencyLimitExceededError extends Error {
  constructor() {
    super('Limite de concorrência excedido.')
    this.name = 'ConcurrencyLimitExceededError'
  }
}

export async function withConcurrencyLimit<T>(
  options: ConcurrencyOptions,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (options.signal?.aborted) {
    throw new ConcurrencyLimitExceededError()
  }
  return task(options.signal ?? new AbortController().signal)
}

export class TaskPool {
  private active = 0
  private readonly queue: Array<{
    start: () => void
    reject: (error: Error) => void
  }> = []
  private readonly controller = new AbortController()

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(
        'O limite de concorrência deve ser um inteiro positivo.',
      )
    }
  }

  get activeCount(): number {
    return this.active
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  async run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.controller.signal.aborted) {
      throw new ConcurrencyLimitExceededError()
    }
    await new Promise<void>((resolve, reject) => {
      const tryStart = (): void => {
        if (this.active < this.limit) {
          this.active++
          resolve()
        } else {
          this.queue.push({ start: tryStart, reject })
        }
      }
      tryStart()
    })

    try {
      if (this.controller.signal.aborted)
        throw new ConcurrencyLimitExceededError()
      return await task(this.controller.signal)
    } finally {
      this.active--
      const next = this.queue.shift()
      if (next) next.start()
    }
  }

  async allSettled<T>(
    tasks: Array<(signal: AbortSignal) => Promise<T>>,
  ): Promise<Array<PromiseSettledResult<T>>> {
    return Promise.all(
      tasks.map((task) =>
        this.run(task).then(
          (value) => ({ status: 'fulfilled', value }) as const,
          (reason) => ({ status: 'rejected', reason }) as const,
        ),
      ),
    )
  }

  abort(): void {
    this.controller.abort()
    for (const entry of this.queue.splice(0)) {
      entry.reject(new ConcurrencyLimitExceededError())
    }
  }
}
