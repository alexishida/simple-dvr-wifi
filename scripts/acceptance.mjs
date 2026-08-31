import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Harness de aceite do MVP (tarefa 15.5). Executa automaticamente os critérios
// automatizáveis (segurança/privacidade, sem internet, build, fuses, binários,
// smoke do pacote) e gera um relatório JSON consolidado. Itens de hardware
// (A1 instalação em máquina limpa, A6/A7/A8/A9/A10/A11 com câmeras reais)
// ficam marcados como pendentes para preenchimento manual no runbook.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dist", "release");

const results = [];
function record(id, label, ok, detail = "") {
  results.push({
    id,
    label,
    status: ok ? "ok" : ok === null ? "pendente" : "falha",
    detail,
  });
}

function runStep(name, args, options = {}) {
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: "pipe",
    ...options,
  });
  return {
    status: child.status,
    output: `${child.stdout ?? ""}${child.stderr ?? ""}`,
  };
}

const packagedExeCandidates = [
  process.env.PACKAGED_EXE,
  resolve(root, "dist", "win-unpacked", "Simple DVR Wi-Fi.exe"),
  resolve(root, "dist", "win-unpacked", "simple-dvr-wifi.exe"),
];
const packagedExe = packagedExeCandidates.find((p) => p && existsSync(p));

function findFuseExecutable() {
  if (packagedExe) return packagedExe;
  const candidates = [
    resolve(root, "dist", "win-unpacked", "Simple DVR Wi-Fi.exe"),
    resolve(root, "dist", "win-unpacked", "simple-dvr-wifi.exe"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function run() {
  // A12 — checklist de segurança/privacidade no build candidato
  if (packagedExe) {
    const env = { ...process.env, PACKAGED_EXE: packagedExe };
    const sec = spawnSync(
      process.execPath,
      ["scripts/security-checklist.mjs"],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        env,
      },
    );
    const ok = sec.status === 0;
    record(
      "A12",
      "Segurança/privacidade (banco, logs, DOM, listeners, tráfego)",
      ok,
    );
  } else {
    record(
      "A12",
      "Segurança/privacidade (banco, logs, DOM, listeners, tráfego)",
      null,
      "PACKAGED_EXE não encontrado",
    );
  }

  // A13 — sem internet: o smoke test valida ausência de recurso remoto
  if (packagedExe) {
    const env = { ...process.env, PACKAGED_EXE: packagedExe };
    const smoke = spawnSync(process.execPath, ["scripts/package-smoke.mjs"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      env,
    });
    const ok = smoke.status === 0;
    record("A13", "Sem internet / loopback-only no pacote", ok);
  } else {
    record(
      "A13",
      "Sem internet / loopback-only no pacote",
      null,
      "PACKAGED_EXE não encontrado",
    );
  }

  // A5 — reinício preserva estado: coberto por testes e2e de restart
  const e2e = runStep("e2e restart", [
    "node_modules/@playwright/test/cli.js",
    "test",
    "e2e/restart.spec.ts",
  ]);
  record(
    "A5",
    "Reinício preserva configuração (e2e)",
    e2e.status === 0,
    e2e.output.slice(0, 300),
  );

  // Build candidato
  const build = runStep(
    "build",
    ["node_modules/electron-vite/bin/electron-vite.js", "build"],
    {
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  record("build", "Build do candidato (electron-vite)", build.status === 0);

  // Fuses
  const fuseExe = findFuseExecutable();
  if (fuseExe) {
    const fuses = runStep("fuses", ["scripts/verify-fuses.mjs", fuseExe]);
    record("fuses", "Fuses de segurança aplicados", fuses.status === 0);
  } else {
    record(
      "fuses",
      "Fuses de segurança aplicados",
      null,
      "sem executável empacotado",
    );
  }

  // Binários de mídia aprovados
  const binaries = runStep("binaries", ["scripts/verify-media-binaries.mjs"]);
  const binariesOk = binaries.status === 0;
  record("binaries", "Binários de mídia presentes com hash válido", binariesOk);

  // Itens de hardware — pendentes de execução manual
  record(
    "A1",
    "Instalação em máquina limpa sem Node.js",
    null,
    "executar NSIS em VM/máquina limpa",
  );
  record(
    "A2",
    "Cadastro manual ou descoberta (câmera real)",
    null,
    "executar com câmera real ou simulador",
  );
  record(
    "A3",
    "Autenticação válida/inválida sem vazar senha",
    null,
    "executar com câmera real",
  );
  record("A6", "Vídeo ao vivo H.264", null, "executar com câmera real");
  record(
    "A7",
    "Múltiplas câmeras (grid 4/9/16)",
    null,
    "executar com câmeras reais",
  );
  record(
    "A8",
    "PTZ suportado (movimento/zoom/presets)",
    null,
    "executar com câmera PTZ",
  );
  record(
    "A9",
    "Snapshot por endpoint e fallback FFmpeg",
    null,
    "executar com câmera real",
  );
  record(
    "A10",
    "Gravação com sessão catalogada",
    null,
    "executar com câmera real",
  );
  record(
    "A11",
    "Reconexão após queda/retorno do RTSP",
    null,
    "executar com câmera real",
  );

  const summary = {
    ok: results.filter((r) => r.status === "ok").length,
    falha: results.filter((r) => r.status === "falha").length,
    pendente: results.filter((r) => r.status === "pendente").length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    summary,
    items: results,
  };

  mkdirSync(outDir, { recursive: true });
  const target = join(outDir, "acceptance-report.json");
  writeFileSync(target, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(
    `\nRelatório de aceite: ${summary.ok} ok, ${summary.falha} falhas, ${summary.pendente} pendentes`,
  );
  for (const item of results) {
    const icon =
      item.status === "ok"
        ? "ok"
        : item.status === "falha"
          ? "FALHA"
          : "pendente";
    console.log(
      `  [${icon}] ${item.id} ${item.label}${item.detail ? ` — ${item.detail}` : ""}`,
    );
  }
  console.log(`\nSalvo em ${target}`);

  if (summary.falha > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
