import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses'
import { resolve } from 'node:path'

const DISABLED = 48
const ENABLED = 49

function asBoolean(state) {
  if (state === DISABLED) return false
  if (state === ENABLED) return true
  return state
}

const executablePath = resolve(process.argv[2] ?? '')
if (!executablePath) {
  throw new Error('Usage: node scripts/verify-fuses.mjs <path-to-electron-executable>')
}

const wire = await getCurrentFuseWire(executablePath)
const expected = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
}

const failures = Object.entries(expected).filter(([fuse, value]) => asBoolean(wire[fuse]) !== value)
if (failures.length > 0) {
  console.error(`Fuse verification failed for ${executablePath}:`, failures)
  process.exit(1)
}

console.log(`Fuse verification passed for ${executablePath} (version ${wire.version})`)
process.exit(0)
