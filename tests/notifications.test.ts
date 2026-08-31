import { describe, expect, it } from 'vitest'
import {
  consolidateDiagnostics,
  fingerprintOf,
  InMemoryNotificationBus,
} from '../src/renderer/notifications.js'

describe('notification bus', () => {
  it('groups ten identical retries into a single persistent issue', () => {
    const bus = new InMemoryNotificationBus()
    let latest: unknown = null
    bus.onIssues((issues) => (latest = issues))

    for (let i = 0; i < 10; i++) {
      bus.addDiagnostic({ code: 'NETWORK_ERROR', message: 'Sem resposta', fingerprint: 'fp-1' })
    }

    const issues = latest as Array<{ count: number }>
    expect(issues).toHaveLength(1)
    expect(issues[0]?.count).toBe(10)
  })

  it('emits toasts for one-off actions only', () => {
    const bus = new InMemoryNotificationBus()
    const toasts: Array<{ message: string }> = []
    bus.onToast((toast) => toasts.push(toast))

    bus.showToast('success', 'Câmera adicionada')
    bus.showToast('error', 'Falha ao remover')
    expect(toasts.map((t) => t.message)).toEqual(['Câmera adicionada', 'Falha ao remover'])
  })

  it('keeps separate issues for different fingerprints', () => {
    const bus = new InMemoryNotificationBus()
    let latest: unknown = null
    bus.onIssues((issues) => (latest = issues))

    bus.addDiagnostic({ code: 'AUTH_ERROR', message: 'Credencial inválida', fingerprint: 'auth' })
    bus.addDiagnostic({ code: 'NETWORK_ERROR', message: 'Sem resposta', fingerprint: 'net' })
    bus.addDiagnostic({ code: 'AUTH_ERROR', message: 'Credencial inválida', fingerprint: 'auth' })

    const issues = latest as Array<{ count: number }>
    expect(issues).toHaveLength(2)
    expect(issues[0]?.count).toBe(2)
    expect(issues[1]?.count).toBe(1)
  })

  it('computes a stable fingerprint for identical code+message', () => {
    expect(fingerprintOf('X', 'm')).toBe(fingerprintOf('X', 'm'))
    expect(fingerprintOf('X', 'm')).not.toBe(fingerprintOf('X', 'n'))
  })

  it('consolidates a list of diagnostics without leaking', () => {
    const issues = consolidateDiagnostics([
      { code: 'NETWORK_ERROR', message: 'Falha em http://user:senha123@host' },
      { code: 'NETWORK_ERROR', message: 'Falha em http://user:senha123@host' },
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.count).toBe(2)
  })
})
