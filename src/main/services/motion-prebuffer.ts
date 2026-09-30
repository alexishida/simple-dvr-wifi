import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { MediaSessionSupervisor } from "../supervisors/media-session.js";

const SEGMENT_MS = 2_000;
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
const CAMERA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface BufferedSegment {
  path: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

interface BufferSession {
  timer: ReturnType<typeof setInterval>;
  seconds: number;
  path: string;
}

export class MotionPrebufferService {
  private readonly sessions = new Map<string, BufferSession>();
  private readonly operations = new Map<string, Promise<unknown>>();

  constructor(
    private readonly media: Pick<MediaSessionSupervisor, "acquire" | "setRecording" | "release">,
    private readonly cacheRoot: string,
    private readonly libraryRoot: string,
  ) {}

  private sessionId(cameraId: string): string {
    if (!CAMERA_ID.test(cameraId)) throw new Error("Identificador de câmera inválido.");
    return `${cameraId}_prebuffer`;
  }

  private cacheDir(cameraId: string): string {
    return resolve(this.cacheRoot, `camera_${cameraId.replaceAll("-", "")}_prebuffer`);
  }

  private async serial<T>(cameraId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(cameraId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.operations.set(cameraId, current);
    try {
      return await current;
    } finally {
      if (this.operations.get(cameraId) === current) this.operations.delete(cameraId);
    }
  }

  async start(cameraId: string, rtspUrl: string, seconds: number): Promise<boolean> {
    return this.serial(cameraId, async () => {
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 30) return false;
      if (this.sessions.has(cameraId)) return true;
      const id = this.sessionId(cameraId);
      const directory = this.cacheDir(cameraId);
      await mkdir(directory, { recursive: true });
      await this.pruneFiles(directory, seconds);
      const path = `camera_${cameraId.replaceAll("-", "")}_prebuffer`;
      const status = await this.media.acquire(
        id, rtspUrl, path, resolve(this.cacheRoot, "%path", "%Y-%m-%d", "%H-%M-%S-%f"), false, SEGMENT_MS,
      );
      if (status.state !== "running" || !await this.media.setRecording(id, true)) {
        await this.media.release(id);
        return false;
      }
      const timer = setInterval(() => {
        void this.serial(cameraId, () => this.pruneFiles(directory, seconds)).catch(() => undefined);
      }, 2_000);
      this.sessions.set(cameraId, { timer, seconds, path });
      return true;
    });
  }

  async capture(cameraId: string, recordingId: string, eventAt: string): Promise<BufferedSegment[]> {
    return this.serial(cameraId, async () => {
      const session = this.sessions.get(cameraId);
      if (!session || !CAMERA_ID.test(recordingId)) return [];
      const eventMs = Date.parse(eventAt);
      if (!Number.isFinite(eventMs)) return [];
      const id = this.sessionId(cameraId);
      if (!await this.media.setRecording(id, false)) return [];
      let files: Array<{ path: string; modifiedMs: number; size: number }> = [];
      try {
        files = await this.segmentFiles(this.cacheDir(cameraId));
      } finally {
        // Resume buffering before copying potentially large files.
        await this.media.setRecording(id, true);
      }
      const cutoff = eventMs - session.seconds * 1_000;
      const selected = files
        .filter((file) => file.size > 0 && file.modifiedMs >= cutoff && file.modifiedMs <= Date.now() + SEGMENT_MS)
        .sort((a, b) => a.modifiedMs - b.modifiedMs);
      const destination = resolve(this.libraryRoot, "motion-prebuffer", recordingId);
      await mkdir(destination, { recursive: true });
      const copied: BufferedSegment[] = [];
      try {
        for (const file of selected) {
          const path = join(destination, `${randomUUID()}-${basename(file.path)}`);
          await copyFile(file.path, path, constants.COPYFILE_EXCL);
          const startedMs = Math.max(cutoff, file.modifiedMs - SEGMENT_MS);
          copied.push({
            path,
            startedAt: new Date(startedMs).toISOString(),
            endedAt: new Date(file.modifiedMs).toISOString(),
            durationMs: file.modifiedMs - startedMs,
          });
        }
      } catch (error) {
        await Promise.all(copied.map((segment) => unlink(segment.path).catch(() => undefined)));
        throw error;
      }
      return copied;
    });
  }

  async stop(cameraId: string): Promise<void> {
    await this.serial(cameraId, async () => {
      const session = this.sessions.get(cameraId);
      if (!session) return;
      this.sessions.delete(cameraId);
      clearInterval(session.timer);
      const id = this.sessionId(cameraId);
      await this.media.setRecording(id, false);
      await this.media.release(id);
      await this.pruneFiles(this.cacheDir(cameraId), 0, true);
    });
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }

  private async segmentFiles(directory: string): Promise<Array<{ path: string; modifiedMs: number; size: number }>> {
    const files: Array<{ path: string; modifiedMs: number; size: number }> = [];
    const visit = async (current: string): Promise<void> => {
      for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile() && /\.(?:mp4|m4s)$/i.test(entry.name)) {
          const info = await stat(path).catch(() => null);
          if (info?.isFile()) files.push({ path, modifiedMs: info.mtimeMs, size: info.size });
        }
      }
    };
    await visit(directory);
    return files;
  }

  private async pruneFiles(directory: string, seconds: number, all = false): Promise<void> {
    const files = (await this.segmentFiles(directory)).sort((a, b) => a.modifiedMs - b.modifiedMs);
    const cutoff = Date.now() - (seconds + 3) * 1_000;
    let bytes = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of files) {
      // A segment touched very recently can still be written by MediaMTX.
      if (!all && Date.now() - file.modifiedMs < SEGMENT_MS) continue;
      if (!all && file.modifiedMs >= cutoff && bytes <= MAX_CACHE_BYTES) continue;
      await unlink(file.path).catch(() => undefined);
      bytes -= file.size;
    }
  }
}
