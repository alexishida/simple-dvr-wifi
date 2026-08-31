import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron, type ElectronApplication, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  userData: string
  close: () => Promise<void>
}

let userDataCounter = 0

export function freshUserData(): string {
  const dir = join(tmpdir(), `swc-e2e-${process.pid}-${userDataCounter++}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

export async function launchApp(
  options: {
    userData?: string
    seedRecordingsDir?: boolean
  } = {},
): Promise<LaunchedApp> {
  const userData = options.userData ?? freshUserData()
  if (options.seedRecordingsDir) {
    mkdirSync(join(userData, 'recordings'), { recursive: true })
  }

  const executablePath = require('electron') as string
  const mainEntry = resolve('out/main/index.js')

  const app = await _electron.launch({
    executablePath,
    args: [mainEntry],
    cwd: process.cwd(),
    env: {
      ...process.env,
      SWC_TEST_USER_DATA: userData,
      ELECTRON_RUN_AS_NODE: undefined,
    },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return {
    app,
    page,
    userData,
    close: async () => {
      await app.close()
    },
  }
}

export async function waitForText(page: Page, text: string, timeout = 15_000): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
}

export async function registerCamera(
  page: Page,
  camera: { name: string; host: string; rtspUrl?: string },
): Promise<void> {
  await page.getByRole('button', { name: /Adicionar manualmente/ }).click()
  await page.locator('#cam-name').fill(camera.name)
  await page.locator('#cam-host').fill(camera.host)
  if (camera.rtspUrl) {
    await page.locator('#cam-rtsp').fill(camera.rtspUrl)
  }
  await page.getByRole('button', { name: /Cadastrar câmera/ }).click()
  // The form unmounts on success; wait for the camera row in the table.
  await page.getByText(camera.name, { exact: false }).first().waitFor({ state: 'visible' })
}

export async function navigateTo(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click()
}
