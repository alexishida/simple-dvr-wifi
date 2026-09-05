import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const executable = process.env.PACKAGED_EXE
if (!executable || !existsSync(executable)) {
  throw new Error(
    'Defina PACKAGED_EXE apontando para o executável do build candidato.',
  )
}

// Reuse the runtime checks; never approve secrecy based on an empty test profile.
for (const script of ['package-smoke.mjs', 'verify-fuses.mjs']) {
  await new Promise((resolveCheck, reject) => {
    const child = spawn(process.execPath, [resolve('scripts', script)], {
      env: { ...process.env, PACKAGED_EXE: resolve(executable) },
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolveCheck()
      else reject(new Error(`Verificação ${script} falhou (exit ${code}).`))
    })
  })
}
console.log(
  'Checklist concluído: runtime, binários do pacote e fuses verificados.',
)
