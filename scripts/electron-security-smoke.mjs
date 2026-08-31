import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const electronExecutable = resolve(
  'node_modules/electron/dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
)
const mainEntry = resolve('out/main/index.js')

if (!existsSync(electronExecutable) || !existsSync(mainEntry)) {
  throw new Error('Execute "npm run build" before the Electron security smoke test.')
}

const environment = { ...process.env, ELECTRON_SECURITY_SMOKE: '1' }
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
    throw new Error(`Electron security smoke test failed (exit ${code}): ${output}`)
  }

  const capabilities = JSON.parse(marker[1])
  if (
    capabilities.hasRequire ||
    capabilities.hasProcess ||
    capabilities.hasIpcRenderer ||
    !capabilities.inlineScriptBlocked ||
    !capabilities.remoteResourceBlocked ||
    !capabilities.databaseWorkerOk ||
    !capabilities.preloadApiLoaded
  ) {
    console.error('--- full app output ---')
    console.error(output)
    throw new Error(`Renderer security/CSP/DB smoke failed: ${marker[1]}`)
  }

  console.log('Electron renderer security, CSP, preload and database worker smoke test passed.')
})
