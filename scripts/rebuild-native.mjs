import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

const root = process.cwd();

function electronExecutable() {
  const candidate = join(
    root,
    "node_modules",
    "electron",
    "dist",
    "electron.exe",
  );
  if (existsSync(candidate)) return candidate;
  throw new Error(
    'Electron não encontrado em node_modules/electron/dist. Execute "npm ci" antes.',
  );
}

function verifySqliteLoadsUnderElectron() {
  const electron = electronExecutable();
  const probe = `try { const db = require('better-sqlite3')(':memory:'); db.exec('create table t(id integer)'); db.prepare('insert into t values (?)').run(1); const row = db.prepare('select count(*) as n from t').get(); if (row.n !== 1) throw new Error('consulta inesperada'); console.log('NATIVE_OK abi=' + process.versions.modules + ' electron=' + process.versions.electron + ' node=' + process.versions.node); } catch (e) { console.error(e); process.exit(1); }`;

  const result = spawnSync(electron, ["--eval", probe], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    windowsHide: true,
  });

  const output = (result.stdout ?? "") + (result.stderr ?? "");
  if (result.status !== 0 || !output.includes("NATIVE_OK")) {
    throw new Error(`Driver SQLite não carregou na ABI Electron.\n${output}`);
  }
  const marker = output.match(/NATIVE_OK[^\r\n]*/);
  console.log(marker ? marker[0] : output);
}

function rebuild() {
  console.log(
    "Reconstruindo módulos nativos para a ABI Electron (electron-builder install-app-deps)...",
  );
  const builder = join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
  );
  if (!existsSync(builder)) {
    throw new Error('electron-builder não encontrado. Execute "npm ci" antes.');
  }
  // No Windows, o .cmd do npm é um script de shell; invocamos via cmd.exe para
  // preservar o wrapper sem abrir shell com argumentos dinâmicos.
  const command =
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : builder;
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `${builder} install-app-deps`]
      : ["install-app-deps"];
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      "Falha ao reconstruir módulos nativos (electron-builder install-app-deps).",
    );
  }
}

rebuild();
verifySqliteLoadsUnderElectron();
console.log(
  "Rebuild nativo OK: driver SQLite reconstruído e verificado na ABI Electron.",
);
