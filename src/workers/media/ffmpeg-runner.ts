import { spawn, type ChildProcess } from 'node:child_process'
import { resolve, isAbsolute } from 'node:path'

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'FORCED_KILL' | 'EXIT' | 'INVALID_ARG' | 'CONFINED',
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

const SHELL_METACHARACTERS = /[;&|`$(){}<>*\n\r]/

export function assertSafeArguments(args: string[]): void {
  for (const arg of args) {
    if (SHELL_METACHARACTERS.test(arg)) {
      throw new FfmpegError('Argumento contém metacaracteres de shell.', 'INVALID_ARG')
    }
  }
}

export function assertConfinedOutputPath(path: string, allowedOutputDirs: string[]): string {
  const resolved = resolve(path)
  if (!isAbsolute(path)) {
    throw new FfmpegError('Caminho de saída deve ser absoluto.', 'CONFINED')
  }
  const ok = allowedOutputDirs.some((dir) => {
    const root = resolve(dir)
    return resolved === root || resolved.startsWith(root + '\\') || resolved.startsWith(root + '/')
  })
  if (!ok) {
    throw new FfmpegError('Caminho de saída fora dos diretórios permitidos.', 'CONFINED')
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
    for (const arg of input.args) {
      if (arg.startsWith('-') || arg.includes(':')) continue
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

    let output = ''
    const onData = (chunk: Buffer): void => {
      output += chunk.toString('utf8')
      if (Buffer.byteLength(output, 'utf8') > maxOutputBytes) {
        output = output.slice(0, maxOutputBytes)
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)

    const timedOut = await new Promise<boolean>((resolveTimeout) => {
      const timer = setTimeout(() => {
        child.kill()
        resolveTimeout(true)
      }, timeoutMs)

      child.once('exit', () => {
        clearTimeout(timer)
        resolveTimeout(false)
      })
    })

    // If timed out, wait for grace then force kill
    if (timedOut) {
      await new Promise((resolveGrace) => {
        const grace = setTimeout(() => {
          child.kill('SIGKILL')
          resolveGrace(null)
        }, killGraceMs)
        child.once('exit', () => {
          clearTimeout(grace)
          resolveGrace(null)
        })
      })
    }

    this.running.delete(key)

    const exitCode = child.exitCode ?? null
    const killed = timedOut || child.signalCode !== null

    if (timedOut) {
      throw new FfmpegError('FFmpeg excedeu o timeout.', 'TIMEOUT')
    }

    return {
      exitCode,
      killed,
      timedOut,
      output,
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
