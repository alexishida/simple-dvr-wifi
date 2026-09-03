import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const MAX_RECORDING_PREVIEW_BYTES = 2 * 1024 * 1024;

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const RECORDING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function previewPath(root: string, recordingId: string): string {
  if (!RECORDING_ID.test(recordingId))
    throw new Error("Identificador de gravação inválido.");

  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, `${recordingId}.jpg`);
  const fromRoot = relative(resolvedRoot, target);
  if (!fromRoot || fromRoot.startsWith("..") || fromRoot.includes(":")) {
    throw new Error("Caminho de preview não autorizado.");
  }
  return target;
}

function validatePreview(buffer: Buffer): void {
  if (!JPEG_MAGIC.equals(buffer.subarray(0, JPEG_MAGIC.byteLength))) {
    throw new Error("O preview precisa estar no formato JPEG.");
  }
  if (buffer.byteLength > MAX_RECORDING_PREVIEW_BYTES) {
    throw new Error("O preview excede o limite permitido.");
  }
}

export async function saveRecordingPreview(
  root: string,
  recordingId: string,
  data: Uint8Array,
): Promise<void> {
  const buffer = Buffer.from(data);
  validatePreview(buffer);
  await mkdir(resolve(root), { recursive: true });
  await writeFile(previewPath(root, recordingId), buffer);
}

export async function readRecordingPreview(
  root: string,
  recordingId: string,
): Promise<string | null> {
  try {
    const buffer = await readFile(previewPath(root, recordingId));
    validatePreview(buffer);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function deleteRecordingPreview(
  root: string,
  recordingId: string,
): Promise<void> {
  try {
    await unlink(previewPath(root, recordingId));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return;
    throw error;
  }
}
