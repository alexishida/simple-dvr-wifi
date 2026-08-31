import { utilityProcess } from 'electron'
import { join } from 'node:path'
import type { DbRequest, DbResponse } from '../../shared/database.js'
import type { DatabaseWorkerTransport } from './database.js'

export function createUtilityProcessTransport(
  dbPath: string,
  backupDir?: string,
): DatabaseWorkerTransport {
  const child = utilityProcess.fork(join(__dirname, 'database-worker.js'), [], {
    serviceName: 'database-worker',
    env: {
      ...process.env,
      DATABASE_PATH: dbPath,
      DATABASE_BACKUP_DIR: backupDir ?? '',
    },
    stdio: 'pipe',
  })

  child.stdout?.on('data', (data: Buffer) => process.stdout.write(data))
  child.stderr?.on('data', (data: Buffer) => process.stderr.write(data))

  const messageListeners = new Set<(response: DbResponse) => void>()
  const exitListeners = new Set<(code: number) => void>()

  child.on('message', (response: DbResponse) => {
    for (const listener of messageListeners) listener(response)
  })
  child.on('exit', (code) => {
    for (const listener of exitListeners) listener(code ?? -1)
  })

  return {
    postMessage: (request: DbRequest) => child.postMessage(request),
    onMessage: (callback) => {
      messageListeners.add(callback)
    },
    onExit: (callback) => {
      exitListeners.add(callback)
    },
    kill: () => child.kill(),
  }
}
