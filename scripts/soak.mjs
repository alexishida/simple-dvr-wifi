import { spawn } from "node:child_process";

// Harness de soak test (tarefa 15.3). Roda testes/soak.test.ts com SOAK_CYCLES
// e SOAK_REPORT=1, gerando docs/release/soak-<platform>-<arch>.json.
//   node scripts/soak.mjs [cycles]
// Ex.: node scripts/soak.mjs 200

const cycles = process.argv[2] ?? process.env.SOAK_CYCLES ?? "40";
const child = spawn(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/soak.test.ts"],
  {
    cwd: process.cwd(),
    env: { ...process.env, SOAK_CYCLES: String(cycles), SOAK_REPORT: "1" },
    stdio: "inherit",
    windowsHide: true,
  },
);

child.once("exit", (code) => process.exit(code ?? 1));
child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
