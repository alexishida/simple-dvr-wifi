import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
const warnings = [];

const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const mediaManifest = JSON.parse(
  readFileSync(join(root, "resources", "media-binaries.json"), "utf8"),
);

function assertMediaComponentApproved() {
  for (const component of mediaManifest.components) {
    if (component.status !== "approved") {
      failures.push(
        `Componente de mídia ${component.id} (${component.platform}) não aprovado (status "${component.status}"). Redistribuição bloqueada.`,
      );
      continue;
    }
    if (!component.fileSha256) {
      failures.push(
        `Componente ${component.id} (${component.platform}) aprovado sem fileSha256 fixado. Fixe o hash do arquivo efetivo antes do release.`,
      );
    }
    const binaryPath = resolve(
      root,
      "resources",
      component.id,
      component.platform,
      component.fileName,
    );
    if (!existsSync(binaryPath)) {
      failures.push(
        `Binário aprovado ausente: ${binaryPath}. Adicione o binário validado antes do release.`,
      );
    }
  }
}

function assertFfmpegConfigCompliant() {
  const ffmpeg = mediaManifest.components.find((c) => c.id === "ffmpeg");
  if (!ffmpeg) return;
  const policy = ffmpeg.codecPolicy;
  if (policy && (policy.allowsGpl || policy.allowsNonfree)) {
    failures.push(
      "FFmpeg com --enable-gpl ou --enable-nonfree não pode ser redistribuído.",
    );
  }
}

function assertNoPendingRuntimeDependencyWithoutLicense() {
  const runtimeNames = new Set(Object.keys(packageJson.dependencies ?? {}));
  for (const name of runtimeNames) {
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry) {
      failures.push(
        `Dependência runtime ${name} ausente do package-lock.json.`,
      );
      continue;
    }
    const license = entry.license ?? entry.licenses;
    if (!license || license === "UNKNOWN") {
      warnings.push(
        `Dependência runtime ${name} sem licença conhecida no lockfile.`,
      );
    }
  }
}

assertMediaComponentApproved();
assertFfmpegConfigCompliant();
assertNoPendingRuntimeDependencyWithoutLicense();

for (const warning of warnings) console.warn(`aviso: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`falha: ${failure}`);
  process.exit(1);
}
console.log(
  `Release gate OK: binários aprovados, configuração de FFmpeg conforme e dependências runtime com licença.`,
);
