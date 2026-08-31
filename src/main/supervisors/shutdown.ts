import type { ChildProcess } from 'node:child_process'

export interface ManagedProcess {
  readonly name: string
  stop(): Promise<void> | void
}

export class ShutdownCoordinator {
  private readonly managed: Map<string, ManagedProcess> = new Map()
  private shuttingDown = false

  register(processHandle: ManagedProcess): void {
    this.managed.set(processHandle.name, processHandle)
  }

  unregister(name: string): void {
    this.managed.delete(name)
  }

  get size(): number {
    return this.managed.size
  }

  async shutdown(timeoutMs: number): Promise<string[]> {
    if (this.shuttingDown) return []
    this.shuttingDown = true

    const timeout = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), timeoutMs).unref()
    })

    const stopped: string[] = []
    const stopping = [...this.managed.values()].map(async (processHandle) => {
      try {
        await processHandle.stop()
        stopped.push(processHandle.name)
      } catch {
        stopped.push(processHandle.name)
      }
    })

    const result = await Promise.race([Promise.all(stopping).then(() => 'done'), timeout])

    if (result === 'timeout') {
      for (const processHandle of this.managed.values()) {
        processHandle.stop()
      }
    }

    this.managed.clear()
    this.shuttingDown = false
    return stopped
  }
}

export function childProcessHandle(child: ChildProcess): ManagedProcess {
  return {
    name: `child:${child.pid ?? 'unknown'}`,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve()
          return
        }
        child.once('exit', () => resolve())
        child.kill()
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL')
          }
          resolve()
        }, 200).unref()
      }),
  }
}
