import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { childProcessHandle, ShutdownCoordinator } from '../src/main/supervisors/shutdown.js'

function spawnLongRunningChild(): ReturnType<typeof spawn> {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  })
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true)
      return
    }
    child.once('exit', () => resolve(true))
    setTimeout(() => resolve(false), timeoutMs).unref()
  })
}

describe('shutdown coordinator', () => {
  it('terminates managed children and leaves no orphans', async () => {
    const child = spawnLongRunningChild()
    const pid = child.pid
    expect(pid).toBeDefined()

    const coordinator = new ShutdownCoordinator()
    coordinator.register(childProcessHandle(child))

    const stopped = await coordinator.shutdown(2_000)
    expect(stopped).toHaveLength(1)
    expect(coordinator.size).toBe(0)

    expect(await waitForExit(child, 500)).toBe(true)
  })

  it('force-kills a child that ignores graceful termination', async () => {
    const child = spawnLongRunningChild()
    const coordinator = new ShutdownCoordinator()
    coordinator.register(childProcessHandle(child))

    await coordinator.shutdown(2_000)

    expect(await waitForExit(child, 1_000)).toBe(true)
  })

  it('ignores a second shutdown while already stopping', async () => {
    const coordinator = new ShutdownCoordinator()
    const child = spawnLongRunningChild()
    coordinator.register(childProcessHandle(child))

    const first = coordinator.shutdown(2_000)
    const second = await coordinator.shutdown(2_000)
    expect(second).toEqual([])
    await first
  })
})
