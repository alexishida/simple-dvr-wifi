import { createSqliteWorker } from './worker.js'
import { MIGRATIONS } from './migrations.js'
import type { DbRequest, DbResponse } from '../../shared/database.js'

const port = process.parentPort

if (!port) {
  throw new Error('Database worker deve rodar como utilityProcess com parentPort.')
}

let workerPromise: ReturnType<typeof createSqliteWorker> | null = null

function ensureWorker(): ReturnType<typeof createSqliteWorker> {
  if (!workerPromise) {
    workerPromise = createSqliteWorker(
      process.env.DATABASE_PATH ?? ':memory:',
      MIGRATIONS,
      process.env.DATABASE_BACKUP_DIR,
    )
  }
  return workerPromise
}

port.on('message', (event: { data: DbRequest }) => {
  const request = event.data
  void ensureWorker()
    .then(async (worker) => worker.dispatch(request))
    .then((response: DbResponse) => port.postMessage(response))
    .catch((error: unknown) => {
      console.error('[database-worker] falha:', error)
      port.postMessage({
        id: request.id,
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Falha no worker de banco.', retryable: false },
      } satisfies DbResponse)
    })
})

port.start?.()
