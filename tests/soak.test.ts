import { createServer, type Server } from "node:net";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MediaSessionSupervisor,
  type MediaProcessFactory,
  type MediaProcessHandle,
} from "../src/main/supervisors/media-session.js";
import { StreamReferenceManager } from "../src/main/supervisors/stream-references.js";
import { sha256OfFile } from "../src/workers/media/mediamtx-config.js";
import { isLoopbackOnly } from "../src/workers/media/whep.js";

// Soak test (tarefa 15.3): ciclos de aquisição/release e queda/retorno com
// sessões simuladas, medindo memória/CPU para detectar vazamento progressivo
// e processo/config órfãos. Roda por padrão no npm test; com SOAK_CYCLES=200
// vira o soak longo reproduzível.

const BINARY_CONTENTS = Buffer.from("soak fake mediamtx binary");
const CAMERAS = 16;
const CYCLES = Number(process.env.SOAK_CYCLES ?? 40);

interface Sample {
  rss: number;
  heapUsed: number;
  external: number;
  cpuUser: number;
  cpuSystem: number;
}

function sample(cpuBefore: { user: number; system: number }): Sample {
  const cpu = process.cpuUsage(cpuBefore);
  const memory = process.memoryUsage();
  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    external: memory.external,
    cpuUser: cpu.user,
    cpuSystem: cpu.system,
  };
}

class LoopbackProcess implements MediaProcessHandle {
  pid: number | undefined = Math.floor(Math.random() * 100_000);
  killed = false;
  private readonly servers: Server[] = [];
  private exitCallback: (() => void) | null = null;

  constructor(listenerCount = 2) {
    for (let i = 0; i < listenerCount; i++) {
      const server = createServer(() => {});
      server.listen(0, "127.0.0.1");
      this.servers.push(server);
    }
  }

  private allListening(): boolean {
    return this.servers.every((server) => {
      const address = server.address();
      return address !== null && typeof address === "object";
    });
  }

  async waitListening(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!this.allListening()) {
      if (Date.now() > deadline)
        throw new Error("fake process did not bind in time");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  allLoopback(): boolean {
    return this.servers.every((server) => {
      const address = server.address();
      return (
        address !== null &&
        typeof address === "object" &&
        (address.address === "127.0.0.1" ||
          address.address === "::1" ||
          address.address === "::ffff:127.0.0.1")
      );
    });
  }

  onExit(callback: () => void): void {
    this.exitCallback = callback;
  }

  kill(): void {
    if (this.killed) return;
    this.killed = true;
    for (const server of this.servers) server.close();
    this.exitCallback?.();
  }
}

function loopbackFactory(processes: LoopbackProcess[]): MediaProcessFactory {
  return {
    spawn: (): MediaProcessHandle => {
      const proc = new LoopbackProcess();
      processes.push(proc);
      return proc;
    },
  };
}

function setupSupervisor(
  dir: string,
  processes: LoopbackProcess[],
): MediaSessionSupervisor {
  const binaryPath = join(dir, "mediamtx.exe");
  writeFileSync(binaryPath, BINARY_CONTENTS);
  return new MediaSessionSupervisor({
    binaryPath,
    expectedHash: sha256OfFile(BINARY_CONTENTS),
    configDir: join(dir, "config"),
    processFactory: loopbackFactory(processes),
  });
}

interface SoakMetrics {
  cycles: number;
  cameras: number;
  startRss: number;
  endRss: number;
  rssDeltaBytes: number;
  peakHeapDeltaBytes: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  sessionsAfterShutdown: number;
  processesAfterShutdown: number;
  configFilesAfterShutdown: number;
  loopbackOnly: boolean;
}

describe(`soak test: ${CYCLES} cycles x ${CAMERAS} cameras`, () => {
  it("runs repeated acquire/release cycles without progressive leaks or orphans", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swc-soak-"));
    const configDir = join(dir, "config");
    const processes: LoopbackProcess[] = [];
    const supervisor = setupSupervisor(dir, processes);
    const refs = new StreamReferenceManager();
    let allLoopback = true;

    const cpuBefore = process.cpuUsage();
    const startSample = sample(cpuBefore);
    let peakHeapDelta = 0;

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const cycleStart = processes.length;

      for (let i = 0; i < CAMERAS; i++) {
        const status = await supervisor.acquire(
          `cam-${i}`,
          `rtsp://127.0.0.1:${5000 + i}/simulated`,
          `camera${i}`,
        );
        expect(status.state).toBe("running");
        const endpoint = supervisor.whepEndpoint(`cam-${i}`, "sub");
        expect(endpoint).not.toBeNull();
        expect(isLoopbackOnly(endpoint?.url ?? "")).toBe(true);
      }

      // verifica loopback enquanto os sidecars simulados ainda estão ativos
      const cycleProcesses = processes.slice(cycleStart);
      await Promise.all(cycleProcesses.map((p) => p.waitListening()));
      allLoopback = allLoopback && cycleProcesses.every((p) => p.allLoopback());

      // exercita quedas/retornos: libera e re-adquire metade das câmeras
      for (let i = 0; i < CAMERAS; i += 2) {
        await supervisor.release(`cam-${i}`);
      }
      for (let i = 0; i < CAMERAS; i += 2) {
        const status = await supervisor.acquire(
          `cam-${i}`,
          `rtsp://127.0.0.1:${5000 + i}/simulated`,
          `camera${i}`,
        );
        expect(status.state).toBe("running");
      }

      // referências de stream: adquire/libera em ciclo para confirmar retorno a zero
      const leases = Array.from({ length: CAMERAS }, (_, i) =>
        refs.acquire({ cameraId: `cam-${i}`, profile: "sub" }),
      );
      for (const lease of leases) lease.release();
      expect(refs.snapshot()).toHaveLength(0);

      const current = sample(cpuBefore);
      peakHeapDelta = Math.max(
        peakHeapDelta,
        current.heapUsed - startSample.heapUsed,
      );

      await supervisor.shutdown();
      expect(supervisor.activeCount).toBe(0);
      expect(
        readdirSync(configDir).filter((f) => f.endsWith(".yml")),
      ).toHaveLength(0);
    }

    const endSample = sample(cpuBefore);
    const orphansAfterShutdown = processes.filter((p) => !p.killed).length;

    const metrics: SoakMetrics = {
      cycles: CYCLES,
      cameras: CAMERAS,
      startRss: startSample.rss,
      endRss: endSample.rss,
      rssDeltaBytes: endSample.rss - startSample.rss,
      peakHeapDeltaBytes: peakHeapDelta,
      cpuUserMs: Math.round(endSample.cpuUser / 1000),
      cpuSystemMs: Math.round(endSample.cpuSystem / 1000),
      sessionsAfterShutdown: supervisor.activeCount,
      processesAfterShutdown: orphansAfterShutdown,
      configFilesAfterShutdown: readdirSync(configDir).filter((f) =>
        f.endsWith(".yml"),
      ).length,
      loopbackOnly: allLoopback,
    };

    console.log(`SOAK_METRICS ${JSON.stringify(metrics)}`);

    if (process.env.SOAK_REPORT === "1") {
      const target = join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "docs",
        "release",
        `soak-${process.platform}-${process.arch}.json`,
      );
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        JSON.stringify(
          {
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            generatedAt: new Date().toISOString(),
            metrics,
          },
          null,
          2,
        ),
      );
      console.log(`Soak report em ${target}`);
    }

    expect(metrics.sessionsAfterShutdown).toBe(0);
    expect(metrics.processesAfterShutdown).toBe(0);
    expect(metrics.configFilesAfterShutdown).toBe(0);
    expect(metrics.loopbackOnly).toBe(true);

    // Vazamento progressivo: o soak longo falha se o RSS crescer de forma
    // contínua além de um teto razoável ao final dos ciclos (amostras curtas
    // podem variar; o limiar considera o delta acumulado).
    const rssGrowthThreshold = 200 * 1024 * 1024;
    expect(metrics.rssDeltaBytes).toBeLessThan(rssGrowthThreshold);

    rmSync(dir, { recursive: true, force: true });
  }, 120_000);
});
