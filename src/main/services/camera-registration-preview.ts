import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rtspUrlWithCredentials } from "../../shared/camera-urls.js";
import { FfmpegRunner } from "../../workers/media/ffmpeg-runner.js";

export interface RegistrationPreviewInput {
  rtspUrl: string;
  username?: string | null;
  password?: string | null;
}

/** A temporary frame, captured without creating a camera or a library item. */
export async function captureRegistrationPreview(
  input: RegistrationPreviewInput,
  binaryPath: string,
  runner: Pick<FfmpegRunner, "run"> = new FfmpegRunner(binaryPath),
): Promise<{ image: string }> {
  const url = rtspUrlWithCredentials(input.rtspUrl, input);
  if (!url) throw new Error("URL RTSP invalida.");
  const directory = await mkdtemp(join(tmpdir(), "dvr-registration-"));
  try {
    const output = join(directory, "preview.jpg");
    const result = await runner.run({
      binaryPath,
      args: ["-nostdin", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", url,
        "-frames:v", "1", "-an", "-vf", "scale=640:-2", "-q:v", "5", "-y", output],
      allowedOutputDirs: [directory],
      timeoutMs: 8_000,
      maxOutputBytes: 4096,
    });
    if (result.timedOut || result.exitCode !== 0) throw new Error("Nao foi possivel obter a previa do canal.");
    if ((await stat(output)).size > 1024 * 1024) throw new Error("Previa excede o tamanho permitido.");
    const data = await readFile(output);
    if (data.length < 3 || !data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      throw new Error("Previa de imagem invalida.");
    }
    return { image: `data:image/jpeg;base64,${data.toString("base64")}` };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
