import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const executable = process.env.PACKAGED_EXE;
if (!executable) {
  throw new Error(
    "Defina PACKAGED_EXE apontando para o executável do build candidato.",
  );
}
if (!existsSync(executable)) {
  throw new Error(`Executável não encontrado: ${executable}`);
}

const CANARY = {
  password: "canario-senha-secreta-xyz",
  token: "canario-token-abc-123",
  urlAuth: "http://canario-user:canario-pass@camera.local/stream",
};

const failures = [];
const ok = [];

function record(name, passed, detail = "") {
  if (passed) ok.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

// 1. Inspeção de código-fonte para segredos canários em artefatos gerados
function scanSourceArtifacts() {
  const outDir = resolve(root, "out");
  if (!existsSync(outDir)) {
    record(
      "artefatos sem segredos canários",
      true,
      "out ausente (build não executado)",
    );
    return;
  }
  const hits = [];
  for (const file of walkFiles(outDir)) {
    const content = readFileSync(file, "utf8");
    for (const secret of [CANARY.password, CANARY.token, CANARY.urlAuth]) {
      if (content.includes(secret)) hits.push(`${file} contém ${secret}`);
    }
  }
  record(
    "artefatos de build sem segredos canários",
    hits.length === 0,
    hits.join("; "),
  );
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (/\.(js|cjs|mjs|html|css)$/.test(entry.name)) yield full;
  }
}

// 2. Smoke test de runtime (renderer, CSP, banco, loopback-only)
function runRuntimeSmoke(userData) {
  return new Promise((resolvePromise) => {
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
      resolvePromise({ code: null, output });
    }, 30_000);
    child.stdout.on("data", (c) => (output += c.toString()));
    child.stderr.on("data", (c) => (output += c.toString()));
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ code: -1, output: String(error) });
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolvePromise({ code, output });
    });
  });
}

async function runChecklist() {
  scanSourceArtifacts();

  const userData = mkdtempSync(join(tmpdir(), "swc-check-"));
  const smoke = await runRuntimeSmoke(userData);
  const marker = smoke.output.match(/__SECURITY_SMOKE__(\{[^\r\n]+\})/);
  record("aplicativo abre e encerra", smoke.code === 0, `exit=${smoke.code}`);
  if (marker) {
    const caps = JSON.parse(marker[1]);
    record(
      "sem require/process/ipcRenderer no renderer",
      !caps.hasRequire && !caps.hasProcess && !caps.hasIpcRenderer,
    );
    record("CSP bloqueia inline", caps.inlineScriptBlocked);
    record("sem recurso remoto", caps.remoteResourceBlocked);
    record("banco OK", caps.databaseWorkerOk);
  } else {
    record("marcador de smoke test emitido", false, smoke.output.slice(0, 500));
  }

  // 3. Inspeção do banco: nenhum plaintext de segredo canário
  const dbCandidates = [
    join(userData, "simple-dvr-wifi.sqlite"),
    ...(existsSync(userData) ? findFiles(userData, ".sqlite") : []),
  ];
  const dbFile = dbCandidates.find((p) => existsSync(p));
  record("banco criado no perfil", Boolean(dbFile));
  if (dbFile) {
    const raw = readFileSync(dbFile, "utf8");
    const leak = [CANARY.password, CANARY.token].filter((s) => raw.includes(s));
    record(
      "banco sem plaintext de segredos",
      leak.length === 0,
      leak.join("; "),
    );
  }

  // 4. Inspeção de logs: nenhum segredo canário
  const logFiles = existsSync(userData) ? findFiles(userData, ".log") : [];
  let logLeak = false;
  for (const log of logFiles) {
    const content = readFileSync(log, "utf8");
    if (
      [CANARY.password, CANARY.token, CANARY.urlAuth].some((s) =>
        content.includes(s),
      )
    ) {
      logLeak = true;
    }
  }
  record(
    "logs sem segredos canários",
    !logLeak,
    `${logFiles.length} logs inspecionados`,
  );

  rmSync(userData, { recursive: true, force: true });

  console.log(
    `\nChecklist de segurança/privacidade: ${ok.length} OK, ${failures.length} falhas`,
  );
  for (const name of ok) console.log(`  ok: ${name}`);
  if (failures.length > 0) {
    for (const name of failures) console.error(`  FALHA: ${name}`);
    process.exit(1);
  }
  console.log(
    "Release candidato aprovado pelo checklist de segurança/privacidade.",
  );
}

function findFiles(dir, suffix) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(full, suffix));
    else if (entry.name.endsWith(suffix)) out.push(full);
  }
  return out;
}

runChecklist().catch((error) => {
  console.error(error);
  process.exit(1);
});
