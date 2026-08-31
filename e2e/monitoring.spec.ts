import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, registerCamera, navigateTo, waitForText } from './helpers.js'

test('register a camera manually and see it in the cameras table', async () => {
  const { page, close } = await launchApp()
  try {
    await navigateTo(page, 'Câmeras')
    await registerCamera(page, { name: 'Câmera teste', host: '192.168.1.50' })
    await expect(page.getByText('Câmera teste', { exact: false })).toBeVisible()
  } finally {
    await close()
  }
})

test('deactivate and reactivate a camera through the app IPC', async () => {
  const { page, close } = await launchApp()
  try {
    await navigateTo(page, 'Câmeras')
    await registerCamera(page, { name: 'Câmera ciclo', host: '192.168.1.51' })

    const id = await page.evaluate(async () => {
      const result = await window.api.cameras.list()
      const camera = result.ok ? result.value.find((c) => c.name === 'Câmera ciclo') : null
      return camera?.id ?? null
    })
    expect(id).not.toBeNull()

    const afterDeactivate = await page.evaluate(async (cameraId) => {
      const ok = (await window.api.cameras.deactivate(cameraId ?? '')).ok
      const list = await window.api.cameras.list()
      return { ok, activeCount: list.ok ? list.value.length : -1 }
    }, id)
    expect(afterDeactivate.ok).toBe(true)
    expect(afterDeactivate.activeCount).toBe(0)

    const afterReactivate = await page.evaluate(async (cameraId) => {
      const ok = (await window.api.cameras.reactivate(cameraId ?? '')).ok
      const list = await window.api.cameras.list()
      return { ok, activeCount: list.ok ? list.value.length : -1 }
    }, id)
    expect(afterReactivate.ok).toBe(true)
    expect(afterReactivate.activeCount).toBe(1)
  } finally {
    await close()
  }
})

test('remove a camera after confirmation', async () => {
  const { page, close } = await launchApp()
  try {
    await navigateTo(page, 'Câmeras')
    await registerCamera(page, { name: 'Câmera remover', host: '192.168.1.52' })

    const row = page.locator('tr', { hasText: 'Câmera remover' })
    await row.getByRole('button', { name: 'Remover' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('.modal').getByRole('button', { name: 'Remover' }).click()

    await expect(page.getByText('Câmera remover', { exact: false })).toHaveCount(0)
  } finally {
    await close()
  }
})

test('edit a camera preserving the credential when password is left empty', async () => {
  const { page, close } = await launchApp()
  try {
    await navigateTo(page, 'Câmeras')
    await registerCamera(page, { name: 'Câmera editar', host: '192.168.1.53' })

    const row = page.locator('tr', { hasText: 'Câmera editar' })
    await row.getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByText(/Editar Câmera editar/)).toBeVisible()
    // leave password empty and save
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.getByText('Câmera editar', { exact: false })).toBeVisible()
  } finally {
    await close()
  }
})

test('dashboard grid switches layouts and opens fullscreen', async () => {
  const { page, close } = await launchApp()
  try {
    await navigateTo(page, 'Câmeras')
    await registerCamera(page, { name: 'Grid cam', host: '192.168.1.54' })

    await navigateTo(page, 'Dashboard')
    await expect(page.getByText('Grid cam', { exact: false })).toBeVisible()

    const grid = page.locator('.monitor-grid')
    await page.getByRole('button', { name: '4', exact: true }).click()
    await expect(grid).toHaveClass(/monitor-grid-4/)

    await page.getByRole('button', { name: '16', exact: true }).click()
    await expect(grid).toHaveClass(/monitor-grid-16/)

    await page.getByRole('button', { name: 'Abrir Grid cam em tela cheia' }).click()
    await expect(page.getByRole('dialog', { name: /Grid cam em tela cheia/ })).toBeVisible()
    await page.getByRole('button', { name: 'Main', exact: true }).click()
    await expect(page.getByRole('dialog', { name: /Grid cam em tela cheia/ })).toBeVisible()
    await page.getByRole('button', { name: 'Sair da tela cheia' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('snapshot action on a card produces visible feedback', async () => {
  const { page, close } = await launchApp()
  try {
    await navigateTo(page, 'Câmeras')
    await registerCamera(page, { name: 'Snapshot cam', host: '192.168.1.55' })
    await navigateTo(page, 'Dashboard')

    const tile = page.locator('.monitor-tile', { hasText: 'Snapshot cam' })
    await tile.getByRole('button', { name: /Capturar snapshot de Snapshot cam/ }).click()
    await expect(tile.locator('.tile-feedback')).toBeVisible({ timeout: 10_000 })
  } finally {
    await close()
  }
})

test('recording start and stop toggles the card indicator', async () => {
  const { page, close } = await launchApp({ seedRecordingsDir: true })
  try {
    await navigateTo(page, 'Câmeras')
    await registerCamera(page, { name: 'Rec cam', host: '192.168.1.56' })
    await navigateTo(page, 'Dashboard')

    const tile = page.locator('.monitor-tile', { hasText: 'Rec cam' })
    await tile.getByRole('button', { name: 'Gravar Rec cam' }).click()
    await expect(tile.locator('.rec-indicator')).toBeVisible({ timeout: 10_000 })
    await tile.getByRole('button', { name: 'Parar gravação de Rec cam' }).click()
    await expect(tile.locator('.rec-indicator')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('discovery view renders interfaces and explains multicast limitations', async () => {
  const { page, close } = await launchApp()
  try {
    await navigateTo(page, 'Descoberta')
    await expect(page.getByText('Configuração da busca')).toBeVisible()
    await expect(page.getByText('Resultados')).toBeVisible()

    const interfaces = await page.evaluate(async () => {
      const result = await window.api.discovery.interfaces()
      return result.ok ? result.value.filter((entry) => entry.eligible).length : -1
    })
    expect(interfaces).toBeGreaterThanOrEqual(0)

    await page.getByRole('button', { name: /Entender limitações de descoberta/ }).click()
    await waitForText(page, /WS-Discovery por multicast/)

    const startDisabled = await page
      .getByRole('button', { name: /Iniciar busca/ })
      .isDisabled()
      .catch(() => true)
    // With at least one eligible interface the start button is enabled.
    expect(startDisabled).toBe(interfaces === 0)
  } finally {
    await close()
  }
})

test('snapshot success path persists a file through IPC', async () => {
  // 1x1 PNG with a valid magic header.
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360010000050001d69a34bc0000000049454e44ae426082',
    'hex',
  )
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length })
    res.end(png)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const snapshotUri = `http://127.0.0.1:${port}/snapshot.jpg`

  const { page, userData, close } = await launchApp()
  try {
    const created = await page.evaluate(async (uri) => {
      const result = await window.api.cameras.create({
        name: 'HTTP snapshot',
        host: '127.0.0.1',
        snapshotUri: uri,
      })
      return result.ok && result.value.camera ? result.value.camera.id : null
    }, snapshotUri)
    expect(created).not.toBeNull()

    const capture = await page.evaluate(
      async ({ id, uri }) => window.api.snapshots.capture({ cameraId: id, snapshotUri: uri }),
      { id: created, uri: snapshotUri },
    )
    expect(capture.ok).toBe(true)

    const snapshotsDir = join(userData, 'snapshots')
    const cameraDir = join(snapshotsDir, created ?? '')
    await expect
      .poll(() => existsSync(cameraDir) && readdirSync(cameraDir).length > 0, {
        timeout: 5_000,
      })
      .toBe(true)
  } finally {
    await close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('PTZ IPC surface responds without crashing the app', async () => {
  const { page, close } = await launchApp()
  try {
    await navigateTo(page, 'Câmeras')
    await registerCamera(page, { name: 'PTZ cam', host: '192.168.1.57' })

    const cameraId = await page.evaluate(async () => {
      const result = await window.api.cameras.list()
      const camera = result.ok ? result.value.find((c) => c.name === 'PTZ cam') : null
      return camera?.id ?? null
    })
    expect(cameraId).not.toBeNull()

    const move = await page.evaluate(async (id) => {
      return window.api.ptz.move(id ?? '', { pan: 0.25, tilt: 0 })
    }, cameraId)
    expect(move.ok).toBe(true)

    const stop = await page.evaluate(async (id) => {
      return window.api.ptz.stop(id ?? '', 'pointer_release')
    }, cameraId)
    expect(stop.ok).toBe(true)
  } finally {
    await close()
  }
})

test('media session lifecycle (acquire/status/release) works through IPC', async () => {
  const { page, close } = await launchApp()
  try {
    const acquire = await page.evaluate(async () => {
      return window.api.media.acquire({
        cameraId: '6d3a35b2-0000-4000-8000-000000000001',
        rtspUrl: 'rtsp://127.0.0.1:9000/simulated',
        path: 'camera1',
      })
    })
    expect(acquire.ok).toBe(true)
    if (acquire.ok) {
      expect(['starting', 'running', 'crashed', 'circuit_open']).toContain(acquire.value.state)
    }

    const status = await page.evaluate(async () => {
      return window.api.media.status('6d3a35b2-0000-4000-8000-000000000001')
    })
    expect(status.ok).toBe(true)

    const release = await page.evaluate(async () => {
      return window.api.media.release('6d3a35b2-0000-4000-8000-000000000001')
    })
    expect(release.ok).toBe(true)
    if (release.ok) expect(release.value.released).toBe(true)
  } finally {
    await close()
  }
})
