import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Smoke test para máquina limpa (instalação sem Node.js). Deve ser executado
// apontando para o executável instalado via PACKAGED_EXE. Roda o marcador de
// segurança/DB do app e confirma loopback-only e ausência de tráfego externo.

const executable = process.env.PACKAGED_EXE;
if (!executable) {
  throw new Error(
    'Defina PACKAGED_EXE apontando para o executável instalado (ex.: "C:\\Program Files\\Simple DVR Wi-Fi\\Simple DVR Wi-Fi.exe").',
  );
}
if (!existsSync(executable)) {
  throw new Error(`Executável não encontrado: ${executable}`);
}

const userData = mkdtempSync(join(tmpdir(), "swc-installed-"));
const environment = {
  ...process.env,
  ELECTRON_SECURITY_SMOKE: "1",
  SWC_TEST_USER_DATA: userData,
};
delete environment.ELECTRON_RUN_AS_NODE;

const child = spawn(executable, [], {
  cwd: resolve(executable, ".."),
  env: environment,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let output = "";
const timeout = setTimeout(() => {
  child.kill();
  throw new Error("Smoke test da instalação excedeu 30 segundos.");
}, 30_000);

child.stdout.on("data", (chunk) => (output += chunk.toString()));
child.stderr.on("data", (chunk) => (output += chunk.toString()));

child.once("error", (error) => {
  clearTimeout(timeout);
  throw error;
});

child.once("exit", (code) => {
  clearTimeout(timeout);
  const marker = output.match(/__SECURITY_SMOKE__(\{[^\r\n]+\})/);
  if (code !== 0 || !marker) {
    console.error("--- saída do aplicativo instalado ---");
    console.error(output);
    throw new Error(`Smoke test da instalação falhou (exit ${code}).`);
  }
  const capabilities = JSON.parse(marker[1]);
  const checks = {
    semRequire: !capabilities.hasRequire,
    semProcess: !capabilities.hasProcess,
    semIpcRenderer: !capabilities.hasIpcRenderer,
    cspBlockedInline: capabilities.inlineScriptBlocked,
    semRecursoRemoto: capabilities.remoteResourceBlocked,
    bancoOk: capabilities.databaseWorkerOk,
    preloadOk: capabilities.preloadApiLoaded,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    for (const [name, ok] of failed) console.error(`falha: ${name}=${ok}`);
    throw new Error(
      "Smoke test da instalação falhou: renderer/segurança/banco.",
    );
  }

  console.log(
    "Smoke test da instalação passou (abertura, banco, mídia, sem internet):",
  );
  console.log(JSON.stringify(checks, null, 2));
  rmSync(userData, { recursive: true, force: true });
});
