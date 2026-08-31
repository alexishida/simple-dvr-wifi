import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'

export const SECURE_FUSE_CONFIG = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
}

export async function applyFusesToExecutable(executablePath) {
  if (!existsSync(executablePath)) {
    throw new Error(`Executable not found: ${executablePath}`)
  }
  await flipFuses(executablePath, SECURE_FUSE_CONFIG)
}

export async function afterPack(context) {
  const { appOutDir, packager } = context
  const executableName =
    process.platform === 'win32'
      ? `${packager.appInfo.productFilename}.exe`
      : packager.appInfo.productFilename
  await applyFusesToExecutable(join(appOutDir, executableName))
}

export default afterPack

const isRunAsMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href

if (isRunAsMain) {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node scripts/apply-fuses.mjs <path-to-executable>')
    process.exit(1)
  }
  await applyFusesToExecutable(target)
  console.log(`Fuses applied to ${target}`)
}
