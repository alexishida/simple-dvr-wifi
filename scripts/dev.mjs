import { spawn } from "node:child_process";
import { resolve } from "node:path";

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

const electronVite = spawn(
  process.execPath,
  [resolve("node_modules/electron-vite/bin/electron-vite.js"), "dev"],
  {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  },
);

electronVite.once("error", (error) => {
  console.error("Não foi possível iniciar o ambiente de desenvolvimento.", error);
  process.exitCode = 1;
});

electronVite.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
