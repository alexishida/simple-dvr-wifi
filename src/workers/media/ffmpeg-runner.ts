import { spawn, type ChildProcess } from 'node:child_process'
import { resolve, isAbsolute, relative, sep } from 'node:path'

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly code:
      'TIMEOUT' | 'FORCED_KILL' | 'EXIT' | 'INVALID_ARG' | 'CONFINED',
  ) {
    super(message)
  }
}

export interface FfmpegRunOptions {
  binaryPath: string
  args: string[]
  allowedOutputDirs: string[]
  /** Absolute input arguments may be read only from these directories. */
  allowedInputDirs?: string[]
  timeoutMs?: number
  maxOutputBytes?: number
  killGraceMs?: number
  signal?: AbortSignal
  onProgress?: (positionMs: number) => void
}

export interface FfmpegRunResult {
  exitCode: number | null
  killed: boolean
  timedOut: boolean
  output: string
  durationMs: number
}

export function assertSafeArguments(args: string[]): void {
  for (const arg of args) {
    if (arg.includes('\0')) {
      throw new FfmpegError('Argumento contém caractere nulo.', 'INVALID_ARG')
    }
  }
}

export function assertConfinedOutputPath(
  path: string,
  allowedOutputDirs: string[],
): string {
  const resolved = resolve(path)
  if (!isAbsolute(path)) {
    throw new FfmpegError('Caminho de saída deve ser absoluto.', 'CONFINED')
  }
  const ok = allowedOutputDirs.some((dir) => {
    const root = resolve(dir)
    const fromRoot = relative(root, resolved)
    return (
      fromRoot !== '' &&
      fromRoot !== '..' &&
      !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot) &&
      !fromRoot.includes(':')
    )
  })
  if (!ok) {
    throw new FfmpegError(
      'Caminho de saída fora dos diretórios permitidos.',
      'CONFINED',
    )
  }
  return resolved
}

function isPathInsideAllowedDirectory(path: string, directories: string[]): boolean {
  const resolved = resolve(path)
  return directories.some((directory) => {
    const fromRoot = relative(resolve(directory), resolved)
    return (
      fromRoot === '' ||
      (!fromRoot.startsWith(`..${sep}`) &&
        fromRoot !== '..' &&
        !isAbsolute(fromRoot) &&
        !fromRoot.includes(':'))
    )
  })
}

function parseProgressPositionMs(output: string): number | null {
  const match = /time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(output)
  if (!match) return null
  const [, hours, minutes, seconds] = match
  return Math.round((Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)) * 1_000)
}

export class FfmpegRunner {
  private readonly running = new Map<string, ChildProcess>()

  constructor(private readonly defaultBinaryPath: string) {}

  get activeCount(): number {
    return this.running.size
  }

  async run(input: FfmpegRunOptions): Promise<FfmpegRunResult> {
    const binaryPath = input.binaryPath || this.defaultBinaryPath
    const timeoutMs = input.timeoutMs ?? 15_000
    const maxOutputBytes = input.maxOutputBytes ?? 64 * 1024
    const killGraceMs = input.killGraceMs ?? 1_000
    const startedAt = Date.now()

    assertSafeArguments(input.args)
    assertConfinedOutputPath(input.args.at(-1) ?? '', input.allowedOutputDirs)
    for (const arg of input.args) {
      if (
        isAbsolute(arg) &&
        !isPathInsideAllowedDirectory(arg, input.allowedOutputDirs) &&
        !isPathInsideAllowedDirectory(arg, input.allowedInputDirs ?? [])
      ) {
        assertConfinedOutputPath(arg, input.allowedOutputDirs)
      }
    }

    if (input.signal?.aborted) {
      throw new FfmpegError('Exportação cancelada.', 'FORCED_KILL')
    }

    const child = spawn(binaryPath, input.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    })

    const key = `${child.pid ?? Math.random()}`
    this.running.set(key, child)

    const outputChunks: Buffer[] = []
    let outputBytes = 0
    const onData = (chunk: Buffer): void => {
      const remaining = maxOutputBytes - outputBytes
      if (remaining > 0) {
        const part = chunk.subarray(0, remaining)
        outputChunks.push(part)
        outputBytes += part.length
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', (chunk: Buffer) => {
      onData(chunk)
      const positionMs = parseProgressPositionMs(chunk.toString('utf8'))
      if (positionMs !== null) input.onProgress?.(positionMs)
    })

    let timedOut = false
    try {
      await new Promise<void>((resolveClose, reject) => {
        let grace: NodeJS.Timeout | undefined
        const abort = (): void => {
          child.kill()
          grace = setTimeout(() => child.kill('SIGKILL'), killGraceMs)
        }
        const timer = setTimeout(() => {
          timedOut = true
          abort()
        }, timeoutMs)
        const cleanup = (): void => {
          clearTimeout(timer)
          if (grace) clearTimeout(grace)
          input.signal?.removeEventListener('abort', abort)
        }
        input.signal?.addEventListener('abort', abort, { once: true })
        child.once('error', () => {
          cleanup()
          reject(new FfmpegError('Não foi possível executar o FFmpeg.', 'EXIT'))
        })
        child.once('close', () => {
          cleanup()
          resolveClose()
        })
      })
    } finally {
      this.running.delete(key)
    }

    const exitCode = child.exitCode ?? null
    const killed = timedOut || child.signalCode !== null

    if (timedOut) {
      throw new FfmpegError('FFmpeg excedeu o timeout.', 'TIMEOUT')
    }
    if (input.signal?.aborted) {
      throw new FfmpegError('Exportação cancelada.', 'FORCED_KILL')
    }

    return {
      exitCode,
      killed,
      timedOut,
      output: Buffer.concat(outputChunks, outputBytes).toString('utf8'),
      durationMs: Date.now() - startedAt,
    }
  }

  killAll(): void {
    for (const child of this.running.values()) {
      child.kill('SIGKILL')
    }
    this.running.clear()
  }
}
