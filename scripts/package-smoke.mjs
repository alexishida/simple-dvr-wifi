import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";

const root = process.cwd();

function findPackagedExecutable() {
  const candidates = [
    process.env.PACKAGED_EXE,
    resolve(root, "dist", "win-unpacked", "Simple DVR Wi-Fi.exe"),
    resolve(root, "dist", "win-unpacked", "simple-dvr-wifi.exe"),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function packagedResourcesDir(exePath) {
  const exeDir = resolve(exePath, "..");
  return resolve(exeDir, "resources");
}

const executable = findPackagedExecutable();
if (!executable) {
  throw new Error(
    'Executável empacotado não encontrado. Execute "npm run build:win" antes ou defina PACKAGED_EXE.',
  );
}

const userData = mkdtempSync(join(tmpdir(), "swc-pkg-"));
process.once("exit", () => {
  const childPath = relative(tmpdir(), userData);
  if (childPath && !childPath.startsWith("..") && !isAbsolute(childPath)) {
    rmSync(userData, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
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
  throw new Error("Smoke test do pacote excedeu 30 segundos.");
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
    console.error("--- saída do pacote ---");
    console.error(output);
    throw new Error(`Smoke test do pacote falhou (exit ${code}).`);
  }
  const capabilities = JSON.parse(marker[1]);
  const checks = {
    hasRequire: capabilities.hasRequire === false,
    hasProcess: capabilities.hasProcess === false,
    hasIpcRenderer: capabilities.hasIpcRenderer === false,
    inlineScriptBlocked: capabilities.inlineScriptBlocked,
    remoteResourceBlocked: capabilities.remoteResourceBlocked,
    databaseWorkerOk: capabilities.databaseWorkerOk,
    preloadApiLoaded: capabilities.preloadApiLoaded,
  };

  const resources = packagedResourcesDir(executable);
  const manifest = JSON.parse(
    readFileSync(join(resources, "media-binaries.json"), "utf8"),
  );
  for (const component of manifest.components) {
    const path = join(
      resources,
      component.id,
      component.platform,
      component.fileName,
    );
    if (component.status !== "approved") {
      checks[`${component.id}:não redistribuído sem aprovação`] =
        !existsSync(path);
      continue;
    }
    checks[`${component.id}:hash`] =
      existsSync(path) &&
      Boolean(component.fileSha256) &&
      createHash("sha256")
        .update(readFileSync(path))
        .digest("hex")
        .toLowerCase() === component.fileSha256.toLowerCase();
  }

  const failed = Object.entries(checks).filter(([, ok]) => ok !== true);
  if (failed.length > 0) {
    console.error("--- falhas de smoke test ---");
    for (const [name, ok] of failed) console.error(`${name}: ${ok}`);
    throw new Error("Smoke test do pacote falhou: renderer/segurança/DB.");
  }

  console.log(
    "Smoke test do pacote passou: renderer, CSP, preload, banco e hashes dos binários aprovados.",
  );
});
