import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "build");
const logoPath = join(root, "docs", "logo", "simple-dvr-wifi-logo.png");

function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256px (0 represents 256 in an ICO directory entry)
  entry[1] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

const logo = readFileSync(logoPath);
mkdirSync(buildDir, { recursive: true });
writeFileSync(join(buildDir, "icon.png"), logo);
writeFileSync(join(buildDir, "icon.ico"), encodeIco(logo));
console.log(
  "Generated installation icons from docs/logo/simple-dvr-wifi-logo.png",
);
