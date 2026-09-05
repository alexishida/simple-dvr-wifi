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
  timeoutMs?: number
  maxOutputBytes?: number
  killGraceMs?: number
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
      if (isAbsolute(arg)) {
        assertConfinedOutputPath(arg, input.allowedOutputDirs)
      }
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
    child.stderr?.on('data', onData)

    let timedOut = false
    try {
      await new Promise<void>((resolveClose, reject) => {
        let grace: NodeJS.Timeout | undefined
        const timer = setTimeout(() => {
          timedOut = true
          child.kill()
          grace = setTimeout(() => child.kill('SIGKILL'), killGraceMs)
        }, timeoutMs)
        const cleanup = (): void => {
          clearTimeout(timer)
          if (grace) clearTimeout(grace)
        }
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
