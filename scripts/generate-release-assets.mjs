import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dist", "release");

const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const mediaManifest = JSON.parse(
  readFileSync(join(root, "resources", "media-binaries.json"), "utf8"),
);

function packageLicense(pkg) {
  return pkg.license ?? pkg.licenses ?? "UNKNOWN";
}

const npmPackages = Object.entries(lock.packages ?? {})
  .filter(([name]) => name && name.startsWith("node_modules/"))
  .map(([name, info]) => {
    const shortName = name.slice("node_modules/".length);
    return {
      name: shortName,
      version: info.version,
      license: packageLicense(info),
      resolved: info.resolved ?? null,
      integrity: info.integrity ?? null,
      runtime: isRuntimeDependency(shortName),
    };
  });

function isRuntimeDependency(name) {
  const runtime = new Set(Object.keys(packageJson.dependencies ?? {}));
  // resolves the effective runtime set: direct runtime deps plus their transitive deps
  const seen = new Set();
  const visit = (depName) => {
    if (seen.has(depName)) return;
    seen.add(depName);
    const entry = lock.packages[`node_modules/${depName}`];
    if (entry?.dependencies)
      for (const child of Object.keys(entry.dependencies)) visit(child);
  };
  for (const dep of runtime) visit(dep);
  return seen.has(name);
}

function mediaSources() {
  return mediaManifest.components.map((component) => ({
    id: component.id,
    platform: component.platform,
    fileName: component.fileName,
    version: component.version,
    origin: component.origin,
    license: component.license,
    buildConfig: component.buildConfig,
    status: component.status,
    archiveSha256: component.archiveSha256,
    fileSha256: component.fileSha256,
    notes: component.notes ?? null,
  }));
}

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: "application",
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
    },
  },
  components: [
    ...npmPackages.map((p) => ({
      type: "library",
      "bom-ref": `pkg:npm/${p.name}@${p.version}`,
      name: p.name,
      version: p.version,
      licenses: [
        {
          license: {
            id: normalizeLicense(p.license),
          },
        },
      ],
      purl: `pkg:npm/${p.name}@${p.version}`,
      properties: [
        { name: "runtime", value: String(p.runtime) },
        { name: "resolved", value: p.resolved ?? "" },
      ],
    })),
    ...mediaSources().map((m) => ({
      type: "executable",
      "bom-ref": `binary:${m.id}@${m.platform}`,
      name: `${m.id} (${m.platform})`,
      version: m.version ?? "pending",
      licenses: [
        {
          license: {
            id: normalizeLicense(m.license),
          },
        },
      ],
      properties: [
        { name: "status", value: m.status },
        { name: "origin", value: m.origin ?? "" },
        { name: "buildConfig", value: m.buildConfig ?? "" },
        { name: "fileSha256", value: m.fileSha256 ?? "" },
      ],
    })),
  ],
};

const licenseInventory = {
  generatedAt: new Date().toISOString(),
  summary: {
    npmPackages: npmPackages.length,
    mediaBinaries: mediaSources().length,
  },
  npm: npmPackages.map((p) => ({
    name: p.name,
    version: p.version,
    license: p.license,
    runtime: p.runtime,
  })),
  media: mediaSources(),
};

function normalizeLicense(license) {
  if (typeof license === "string") return license;
  if (Array.isArray(license)) return license.map((l) => l.type).join(" OR ");
  if (license && typeof license === "object") return license.type ?? "UNKNOWN";
  return "UNKNOWN";
}

function buildNotice() {
  const lines = [];
  lines.push(`Simple DVR Wi-Fi ${packageJson.version}`);
  lines.push("");
  lines.push(
    "Este produto redistribui os seguintes componentes. As licenças completas",
  );
  lines.push(
    "devem acompanhar a distribuição conforme as obrigações de cada licença.",
  );
  lines.push("");
  lines.push("=== Dependências npm ===");
  for (const p of npmPackages.filter((x) => x.runtime)) {
    lines.push(`- ${p.name}@${p.version} (${p.license})`);
  }
  lines.push("");
  lines.push("=== Binários de mídia ===");
  for (const m of mediaSources()) {
    lines.push(
      `- ${m.id} (${m.platform}) ${m.version ?? "pendente"} (${m.license})`,
    );
    lines.push(`  origem: ${m.origin ?? "não definida"}`);
    lines.push(`  configuração: ${m.buildConfig ?? "não definida"}`);
  }
  lines.push("");
  lines.push(
    "Fontes e configurações correspondentes de cada binário devem ser obtidas",
  );
  lines.push(
    "na origem registrada; build LGPL de FFmpeg sem --enable-gpl/--enable-nonfree",
  );
  lines.push(
    "conforme o relatório de decisão docs/decisions/dependency-spike-windows.md.",
  );
  return lines.join("\n") + "\n";
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "sbom.json"), JSON.stringify(sbom, null, 2) + "\n");
writeFileSync(
  join(outDir, "license-inventory.json"),
  JSON.stringify(licenseInventory, null, 2) + "\n",
);
writeFileSync(join(outDir, "NOTICE.txt"), buildNotice());
writeFileSync(
  join(outDir, "media-sources.json"),
  JSON.stringify(mediaSources(), null, 2) + "\n",
);

console.log(`Assets de release gerados em ${outDir}:`);
console.log(
  "  sbom.json, license-inventory.json, NOTICE.txt, media-sources.json",
);
console.log(
  `Componentes: ${npmPackages.length} pacotes npm (${npmPackages.filter((p) => p.runtime).length} runtime), ${mediaSources().length} binários de mídia.`,
);
