import { spawn } from 'node:child_process'

const child = spawn(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'tests/perf-baseline.test.ts'],
  {
    cwd: process.cwd(),
    env: { ...process.env, PERF_BASELINE_REPORT: '1' },
    stdio: 'inherit',
    windowsHide: true,
  },
)

child.once('exit', (code) => process.exit(code ?? 1))
child.once('error', (error) => {
  console.error(error)
  process.exit(1)
})
