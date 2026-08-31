import { mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatLogEntry, StructuredLogger, type LogEntry } from '../src/main/logging/logger.js'

describe('structured logger', () => {
  it('formats entries with UTC timestamp, level and context', () => {
    const entry: LogEntry = {
      timestamp: '2026-08-30T12:00:00.000Z',
      level: 'error',
      message: 'Conexão falhou',
      correlationId: 'corr-123',
      cameraId: 'cam-1',
      code: 'NETWORK_ERROR',
    }
    const line = formatLogEntry(entry)
    expect(line).toContain('2026-08-30T12:00:00.000Z')
    expect(line).toContain('[ERROR]')
    expect(line).toContain('corr=corr-123')
    expect(line).toContain('cam=cam-1')
    expect(line).toContain('code=NETWORK_ERROR')
    expect(line).toContain('Conexão falhou')
  })

  it('writes only enabled levels to the log file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-log-'))
    const logger = new StructuredLogger({
      level: 'warn',
      directory: dir,
      maxBytes: 1024 * 1024,
      maxFiles: 3,
    })

    logger.debug('não deve aparecer')
    logger.info('não deve aparecer')
    logger.warn('aviso visível')
    logger.error('erro visível')

    const content = readFileSync(join(dir, 'app.log'), 'utf8')
    expect(content).not.toContain('não deve aparecer')
    expect(content).toContain('aviso visível')
    expect(content).toContain('erro visível')
  })

  it('rotates the log file when it exceeds maxBytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-log-'))
    const logger = new StructuredLogger({
      level: 'info',
      directory: dir,
      maxBytes: 200,
      maxFiles: 3,
    })

    for (let i = 0; i < 50; i++) {
      logger.info(`mensagem número ${i} com conteúdo suficiente para encher o arquivo`)
    }

    const files = readdirSync(dir).filter((f) => f.startsWith('app.log') || f.startsWith('app.'))
    expect(files.length).toBeGreaterThan(1)
    expect(statSync(join(dir, 'app.log')).size).toBeLessThanOrEqual(400)
  })

  it('invokes the sink when provided', () => {
    const seen: LogEntry[] = []
    const dir = mkdtempSync(join(tmpdir(), 'swc-log-'))
    const logger = new StructuredLogger({
      level: 'info',
      directory: dir,
      maxBytes: 1024,
      maxFiles: 2,
      sink: (entry) => seen.push(entry),
    })

    logger.info('olá')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ message: 'olá', level: 'info' })
  })

  it('does not create files at debug level when level is error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swc-log-'))
    writeFileSync(join(dir, 'app.log'), '')
    const logger = new StructuredLogger({
      level: 'error',
      directory: dir,
      maxBytes: 1024,
      maxFiles: 2,
    })
    expect(logger.level).toBe('error')
  })
})
