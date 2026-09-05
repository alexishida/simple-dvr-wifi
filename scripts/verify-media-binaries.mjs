import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, "resources", "media-binaries.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function sha256OfFile(filePath) {
  return createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex")
    .toUpperCase();
}

const failures = [];
const warnings = [];

for (const component of manifest.components) {
  const binaryPath = resolve(
    root,
    "resources",
    component.id,
    component.platform,
    component.fileName,
  );
  if (component.status !== "approved") {
    warnings.push(
      `${component.id} (${component.platform}) está com status "${component.status}"; redistribuição bloqueada até aprovação.`,
    );
    continue;
  }
  if (!existsSync(binaryPath)) {
    failures.push(
      `${component.id} (${component.platform}) aprovado, mas binário ausente em ${binaryPath}.`,
    );
    continue;
  }
  if (!component.fileSha256) {
    failures.push(
      `${component.id} (${component.platform}) presente, mas sem fileSha256 registrado; hash efetivo ${sha256OfFile(
        binaryPath,
      )} deve ser fixado no manifesto.`,
    );
    continue;
  }
  const actual = sha256OfFile(binaryPath);
  if (actual !== component.fileSha256.toUpperCase()) {
    failures.push(
      `${component.id} (${component.platform}) hash divergente: esperado ${component.fileSha256}, obtido ${actual}.`,
    );
  }
}

for (const warning of warnings) console.warn(`aviso: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`falha: ${failure}`);
  process.exit(1);
}
console.log(
  `Validação de binários OK: ${manifest.components.length} componentes avaliados, ${failures.length} falhas, ${warnings.length} avisos.`,
);
