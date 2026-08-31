import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LogLevel } from '../../shared/config.js'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  correlationId?: string
  cameraId?: string
  code?: string
  fields?: Record<string, unknown>
}

export interface LoggerOptions {
  level: LogLevel
  directory: string
  maxBytes: number
  maxFiles: number
  sink?: (entry: LogEntry) => void
}

const LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 }

const LEVEL_LABEL: Record<LogLevel, string> = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
}

function utcIso(): string {
  return new Date().toISOString()
}

function sanitizeField(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\r?\n/g, '\\n')
  return value
}

export function formatLogEntry(entry: LogEntry): string {
  const parts = [
    entry.timestamp,
    `[${LEVEL_LABEL[entry.level]}]`,
    entry.correlationId ? `corr=${entry.correlationId}` : null,
    entry.cameraId ? `cam=${entry.cameraId}` : null,
    entry.code ? `code=${entry.code}` : null,
  ].filter((p) => p !== null)

  let line = `${parts.join(' ')} ${entry.message}`
  if (entry.fields && Object.keys(entry.fields).length > 0) {
    const serialized = Object.entries(entry.fields)
      .map(([key, value]) => `${key}=${JSON.stringify(sanitizeField(value))}`)
      .join(' ')
    line += ` ${serialized}`
  }
  return line
}

export class StructuredLogger {
  private readonly currentFile: string

  constructor(private readonly options: LoggerOptions) {
    if (!existsSync(options.directory)) {
      mkdirSync(options.directory, { recursive: true })
    }
    this.currentFile = join(options.directory, 'app.log')
    this.rotateIfNeeded()
  }

  get level(): LogLevel {
    return this.options.level
  }

  private enabled(level: LogLevel): boolean {
    return LEVEL_RANK[level] <= LEVEL_RANK[this.options.level]
  }

  private write(entry: LogEntry): void {
    if (this.options.sink) this.options.sink(entry)
    this.rotateIfNeeded()
    appendFileSync(this.currentFile, `${formatLogEntry(entry)}\n`, 'utf8')
  }

  private rotateIfNeeded(): void {
    try {
      const size = statSync(this.currentFile).size
      if (size < this.options.maxBytes) return
    } catch {
      return
    }

    for (let i = this.options.maxFiles - 1; i >= 1; i--) {
      const from = join(dirname(this.currentFile), `app.${i}.log`)
      const to = join(dirname(this.currentFile), `app.${i + 1}.log`)
      if (existsSync(from)) renameSync(from, to)
    }
    renameSync(this.currentFile, join(dirname(this.currentFile), 'app.1.log'))
  }

  error(message: string, context?: Omit<LogEntry, 'timestamp' | 'level' | 'message'>): void {
    if (this.enabled('error'))
      this.write({ timestamp: utcIso(), level: 'error', message, ...context })
  }

  warn(message: string, context?: Omit<LogEntry, 'timestamp' | 'level' | 'message'>): void {
    if (this.enabled('warn'))
      this.write({ timestamp: utcIso(), level: 'warn', message, ...context })
  }

  info(message: string, context?: Omit<LogEntry, 'timestamp' | 'level' | 'message'>): void {
    if (this.enabled('info'))
      this.write({ timestamp: utcIso(), level: 'info', message, ...context })
  }

  debug(message: string, context?: Omit<LogEntry, 'timestamp' | 'level' | 'message'>): void {
    if (this.enabled('debug'))
      this.write({ timestamp: utcIso(), level: 'debug', message, ...context })
  }
}

export function createLogger(options: LoggerOptions): StructuredLogger {
  return new StructuredLogger(options)
}
