import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { FfmpegRunner } from "../../workers/media/ffmpeg-runner.js";
import { checkStorageStatus, shouldAllowWrite } from "./storage-monitor.js";
import type { SdCardRecording } from "../../shared/sd-card.js";
import type { CameraRecord } from "../../shared/database.js";
import type { SdCardAdapter, SdCardDownloadRequest, SdCardListRequest } from "./sd-card-adapter.js";

type SourceRecording = SdCardRecording & { filePath: string };
type Credentials = { username: string; password: string };
type RpcAnswer = {
  result?: unknown;
  params?: Record<string, unknown>;
  session?: string;
  error?: { message?: string };
};

const MAX_FILES = 3_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const FILE_PATH =
  /^\/mnt\/sd\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[A-Za-z0-9/._@[\]-]+\.dav$/;
const CAMERA_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

function localTimestamp(value: string): string {
  const match = CAMERA_TIME.exec(value);
  if (!match) throw new Error("Horário de gravação inválido.");
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    throw new Error("Horário de gravação inválido.");
  }
  return parsed.toISOString();
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex").toUpperCase();
}

class RpcSession {
  private session = "";
  private requestId = 2;
  constructor(
    private readonly host: string,
    private readonly credential: Credentials,
  ) {}

  private async post(path: string, body: unknown): Promise<RpcAnswer> {
    const response = await fetch(`http://${this.host}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok)
      throw new Error("A câmera não respondeu à consulta do cartão SD.");
    const data = (await response.json()) as RpcAnswer;
    return data;
  }

  async login(): Promise<void> {
    const params = {
      userName: this.credential.username,
      password: "",
      clientType: "Web3.0",
      loginType: "Direct",
    };
    const challenge = await this.post("/RPC2_Login", {
      method: "global.login",
      params,
      id: 1,
    });
    const realm = challenge.params?.realm;
    const nonce = challenge.params?.random;
    if (
      typeof realm !== "string" ||
      typeof nonce !== "string" ||
      typeof challenge.session !== "string"
    ) {
      throw new Error("A câmera não ofereceu autenticação RPC2.");
    }
    const password = md5(
      `${this.credential.username}:${nonce}:${md5(`${this.credential.username}:${realm}:${this.credential.password}`)}`,
    );
    const signed = await this.post("/RPC2_Login", {
      method: "global.login",
      params: {
        ...params,
        password,
        authorityType: "Default",
        passwordType: "Default",
      },
      id: 2,
      session: challenge.session,
    });
    if (signed.result !== true)
      throw new Error(
        "A credencial da câmera foi recusada para consultar o cartão SD.",
      );
    this.session = signed.session ?? challenge.session;
  }

  async call(
    method: string,
    params: object | null = null,
    object?: number,
  ): Promise<RpcAnswer> {
    if (!this.session) throw new Error("Sessão da câmera indisponível.");
    const answer = await this.post("/RPC2", {
      method,
      params,
      id: ++this.requestId,
      session: this.session,
      ...(object === undefined ? {} : { object }),
    });
    if (answer.result === false)
      throw new Error(`A câmera não oferece ${method}.`);
    return answer;
  }

  async close(): Promise<void> {
    if (!this.session) return;
    try {
      await this.call("global.logout");
    } catch {
      /* A sessão também expira na câmera. */
    }
    this.session = "";
  }
}

function parseRecording(
  cameraId: string,
  raw: unknown,
): SourceRecording | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (
    typeof item.FilePath !== "string" ||
    !FILE_PATH.test(item.FilePath) ||
    item.FilePath.split("/").some(
      (segment) => segment === "." || segment === "..",
    ) ||
    typeof item.StartTime !== "string" ||
    typeof item.EndTime !== "string" ||
    typeof item.Length !== "number" ||
    !Number.isSafeInteger(item.Length) ||
    item.Length < 1 ||
    item.Length > MAX_FILE_BYTES
  )
    return null;
  try {
    const startedAt = localTimestamp(item.StartTime);
    const endedAt = localTimestamp(item.EndTime);
    const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
    if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) return null;
    const id = createHash("sha256")
      .update(`${cameraId}\0${item.FilePath}`)
      .digest("hex");
    return {
      id,
      cameraId,
      startedAt,
      endedAt,
      durationMs,
      bytes: item.Length,
      filePath: item.FilePath,
      downloaded: false,
    };
  } catch {
    return null;
  }
}

function digestAuthorization(
  challenge: string,
  path: string,
  credential: Credentials,
): string {
  const fields = Object.fromEntries(
    [...challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map((match) => [
      match[1]!.toLowerCase(),
      match[2] ?? match[3],
    ]),
  );
  if (!challenge.startsWith("Digest ") || !fields.realm || !fields.nonce)
    throw new Error("Autenticação de download não suportada.");
  const cnonce = randomBytes(8).toString("hex");
  const nc = "00000001";
  const qop = fields.qop
    ?.split(",")
    .map((value) => value.trim())
    .find((value) => value === "auth");
  const digest = (value: string): string =>
    createHash("md5").update(value).digest("hex");
  const ha1 = digest(
    `${credential.username}:${fields.realm}:${credential.password}`,
  );
  const ha2 = digest(`GET:${path}`);
  const response = qop
    ? digest(`${ha1}:${fields.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : digest(`${ha1}:${fields.nonce}:${ha2}`);
  const values = [
    `username="${credential.username.replaceAll('"', "")}"`,
    `realm="${fields.realm}"`,
    `nonce="${fields.nonce}"`,
    `uri="${path}"`,
    `response="${response}"`,
    ...(qop ? [`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []),
    ...(fields.opaque ? [`opaque="${fields.opaque}"`] : []),
  ];
  return `Digest ${values.join(", ")}`;
}

async function downloadFile(
  host: string,
  filePath: string,
  bytes: number,
  credential: Credentials,
  target: string,
): Promise<void> {
  const path = `/cgi-bin/RPC_Loadfile${filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
  const url = `http://${host}${path}`;
  let response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (response.status === 401) {
    const challenge = response.headers.get("www-authenticate") ?? "";
    await response.body?.cancel();
    response = await fetch(url, {
      headers: {
        Authorization: digestAuthorization(challenge, path, credential),
      },
      signal: AbortSignal.timeout(60_000),
    });
  }
  if (!response.ok || !response.body)
    throw new Error("A câmera não permitiu baixar este vídeo.");
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      callback(
        received > bytes
          ? new Error("O vídeo excedeu o tamanho anunciado pela câmera.")
          : null,
        chunk,
      );
    },
  });
  let received = 0;
  await pipeline(
    Readable.fromWeb(response.body as never),
    limit,
    createWriteStream(target, { flags: "wx" }),
  );
  if (received !== bytes)
    throw new Error(
      "O download terminou antes do tamanho anunciado pela câmera.",
    );
}

export class MiboSdCardService implements SdCardAdapter {
  readonly id = "intelbras-mibo-im4-c";
  private readonly listings = new Map<
    string,
    { expiresAt: number; entries: Map<string, SourceRecording> }
  >();
  private readonly downloads = new Set<string>();

  supports(camera: CameraRecord): boolean {
    return /intelbras/i.test(camera.manufacturer ?? "") && /^im4-c$/i.test(camera.model ?? "");
  }

  detail(): string {
    return "Cartão SD via API local Mibo"
  }

  async list({ camera, credential, date, libraryRoot }: SdCardListRequest): Promise<SdCardRecording[]> {
    const cameraId = camera.id;
    const host = camera.host;
    if (!/^[A-Za-z0-9.-]+$/.test(host))
      throw new Error("Endereço da câmera inválido.");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00`))
    )
      throw new Error("Selecione uma data válida.");
    const rpc = new RpcSession(host, credential);
    await rpc.login();
    const items: SourceRecording[] = [];
    let finder: number | null = null;
    try {
      const created = await rpc.call("mediaFileFind.factory.create");
      if (
        typeof created.result !== "number" ||
        !Number.isSafeInteger(created.result)
      )
        throw new Error("Busca de vídeos indisponível na câmera.");
      finder = created.result;
      await rpc.call(
        "mediaFileFind.findFile",
        {
          condition: {
            Channel: 0,
            StartTime: `${date} 00:00:00`,
            EndTime: `${date} 23:59:59`,
            Types: ["dav"],
          },
        },
        finder,
      );
      for (
        let pageNumber = 0;
        pageNumber < 30 && items.length < MAX_FILES;
        pageNumber++
      ) {
        const page = await rpc.call(
          "mediaFileFind.findNextFile",
          { count: Math.min(100, MAX_FILES - items.length) },
          finder,
        );
        const infos = page.params?.infos;
        if (!Array.isArray(infos)) break;
        for (const info of infos) {
          const item = parseRecording(cameraId, info);
          if (item && item.filePath.startsWith(`/mnt/sd/${date}/`))
            items.push(item);
        }
        if (infos.length < 100) break;
      }
    } finally {
      if (finder !== null) {
        try {
          await rpc.call("mediaFileFind.close", null, finder);
        } catch {
          /* fim da consulta */
        }
        try {
          await rpc.call("mediaFileFind.destroy", null, finder);
        } catch {
          /* fim da consulta */
        }
      }
      await rpc.close();
    }
    const entries = new Map(items.map((item) => [item.id, item]));
    this.listings.set(cameraId, {
      expiresAt: Date.now() + 10 * 60_000,
      entries,
    });
    const stored = new Set(
      await readdir(join(libraryRoot, "sd-card", cameraId, date)).catch(
        () => [],
      ),
    );
    return [...entries.values()].map((item) => ({
      id: item.id,
      cameraId: item.cameraId,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      durationMs: item.durationMs,
      bytes: item.bytes,
      downloaded: stored.has(`${item.id}.mp4`),
    }));
  }

  private target(
    root: string,
    cameraId: string,
    date: string,
    id: string,
  ): string {
    return resolve(root, "sd-card", cameraId, date, `${id}.mp4`);
  }

  private async isDownloaded(
    root: string,
    cameraId: string,
    date: string,
    id: string,
  ): Promise<boolean> {
    try {
      return (await stat(this.target(root, cameraId, date, id))).size > 0;
    } catch {
      return false;
    }
  }

  async download({ camera, credential, id, libraryRoot: root, ffmpegPath, database }: SdCardDownloadRequest): Promise<{ path: string; imported: boolean }> {
    const cameraId = camera.id;
    const host = camera.host;
    if (!/^[A-Za-z0-9.-]+$/.test(host))
      throw new Error("Endereço da câmera inválido.");
    const listing = this.listings.get(cameraId);
    const item =
      listing?.expiresAt && listing.expiresAt > Date.now()
        ? listing.entries.get(id)
        : undefined;
    if (!item) throw new Error("Atualize a lista do cartão antes de baixar.");
    if (this.downloads.has(id))
      throw new Error("Este vídeo já está sendo baixado.");
    this.downloads.add(id);
    const date = item.filePath.slice("/mnt/sd/".length, "/mnt/sd/".length + 10);
    const target = this.target(root, cameraId, date, id);
    const dir = join(root, "sd-card", cameraId, date);
    const raw = join(dir, `${id}.${randomUUID()}.dav`);
    const converted = join(dir, `${id}.${randomUUID()}.mp4`);
    let createdThisCall = false;
    try {
      await mkdir(dir, { recursive: true });
      if (!(await this.isDownloaded(root, cameraId, date, id))) {
        const storage = await checkStorageStatus(dir, {
          minFreeBytes: Math.max(256 * 1024 * 1024, item.bytes * 3),
        });
        if (!shouldAllowWrite(storage))
          throw new Error("Espaço insuficiente para importar este vídeo.");
        await downloadFile(host, item.filePath, item.bytes, credential, raw);
        const result = await new FfmpegRunner(ffmpegPath).run({
          binaryPath: ffmpegPath,
          args: [
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-i",
            raw,
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            "-y",
            converted,
          ],
          allowedInputDirs: [dir],
          allowedOutputDirs: [dir],
          timeoutMs: 120_000,
        });
        if (result.exitCode !== 0 || !(await stat(converted)).size)
          throw new Error(
            "O vídeo foi baixado, mas não pôde ser convertido para MP4.",
          );
        await rename(converted, target);
        createdThisCall = true;
      }
      const imported = await database.request("recording.importSdCard", {
        cameraId,
        path: target,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        durationMs: item.durationMs,
      });
      if (!imported.ok) {
        if (createdThisCall) await unlink(target).catch(() => undefined);
        throw new Error("O vídeo não pôde ser adicionado à biblioteca.");
      }
      return { path: target, imported: true };
    } finally {
      this.downloads.delete(id);
      await Promise.all(
        [raw, converted].map((path) => unlink(path).catch(() => undefined)),
      );
    }
  }
}
