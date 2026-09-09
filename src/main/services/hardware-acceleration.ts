import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FILE_NAME = "hardware-acceleration.json";

// Electron needs this before ready, before the SQLite utility process can start.
// Missing/legacy preferences retain Chromium's automatic hardware selection.
export function loadHardwareAcceleration(userData: string): boolean {
  try {
    const value: unknown = JSON.parse(
      readFileSync(join(userData, FILE_NAME), "utf8"),
    );
    return !(
      value &&
      typeof value === "object" &&
      "enabled" in value &&
      value.enabled === false
    );
  } catch {
    return true;
  }
}

export async function saveHardwareAcceleration(
  userData: string,
  enabled: boolean,
): Promise<void> {
  await mkdir(userData, { recursive: true });
  const target = join(userData, FILE_NAME);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ enabled }), "utf8");
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
