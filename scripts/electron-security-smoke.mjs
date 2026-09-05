import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, relative, isAbsolute } from 'node:path'

const electronExecutable = resolve(
  'node_modules/electron/dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
)
const mainEntry = resolve('out/main/index.js')

if (!existsSync(electronExecutable) || !existsSync(mainEntry)) {
  throw new Error(
    'Execute "npm run build" before the Electron security smoke test.',
  )
}

const testRoot = tmpdir()
const userData = mkdtempSync(join(testRoot, 'dvr-security-smoke-'))
const environment = {
  ...process.env,
  ELECTRON_SECURITY_SMOKE: '1',
  SWC_TEST_USER_DATA: userData,
}
process.once('exit', () => {
  const childPath = relative(testRoot, userData)
  if (childPath && !childPath.startsWith('..') && !isAbsolute(childPath)) {
    rmSync(userData, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
  }
})
delete environment.ELECTRON_RUN_AS_NODE

const child = spawn(electronExecutable, [mainEntry], {
  cwd: process.cwd(),
  env: environment,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let output = ''
const timeout = setTimeout(() => {
  child.kill()
  throw new Error('Electron security smoke test timed out after 15 seconds.')
}, 15_000)

child.stdout.on('data', (chunk) => {
  output += chunk.toString()
})
child.stderr.on('data', (chunk) => {
  output += chunk.toString()
})

child.once('error', (error) => {
  clearTimeout(timeout)
  throw error
})

child.once('exit', (code) => {
  clearTimeout(timeout)
  const marker = output.match(/__SECURITY_SMOKE__(\{[^\r\n]+\})/)
  if (code !== 0 || !marker) {
    throw new Error(
      `Electron security smoke test failed (exit ${code}): ${output}`,
    )
  }

  const capabilities = JSON.parse(marker[1])
  if (
    capabilities.hasRequire !== false ||
    capabilities.hasProcess !== false ||
    capabilities.hasIpcRenderer !== false ||
    capabilities.inlineScriptBlocked !== true ||
    capabilities.remoteResourceBlocked !== true ||
    capabilities.databaseWorkerOk !== true ||
    capabilities.preloadApiLoaded !== true
  ) {
    console.error('--- full app output ---')
    console.error(output)
    throw new Error(`Renderer security/CSP/DB smoke failed: ${marker[1]}`)
  }

  console.log(
    'Electron renderer security, CSP, preload and database worker smoke test passed.',
  )
})
