import { performance } from "node:perf_hooks";
import { SqliteWorker } from "../src/workers/database/worker.ts";
import { MIGRATIONS } from "../src/workers/database/migrations.ts";
import { seedMediaLibraryCatalog } from "./media-library-fixtures.mjs";

const scenarios = [
  { name: "small", cameraCount: 3, recordingsPerCamera: 10, snapshotsPerCamera: 15 },
  { name: "large", cameraCount: 8, recordingsPerCamera: 250, snapshotsPerCamera: 300 },
];
const repetitions = 5;

async function measureScenario(scenario) {
  const worker = new SqliteWorker(MIGRATIONS);
  worker.open(":memory:");
  let queryCount = 0;
  let sequence = 0;
  const request = async (op, payload) => {
    if (op === "snapshot.list" || op === "recording.library") queryCount += 1;
    const response = await worker.dispatch({ id: `benchmark-${sequence += 1}`, op, payload });
    if (!response.ok) throw new Error(response.error.message);
    return response.value;
  };

  try {
    const cameras = await seedMediaLibraryCatalog({
      request,
      database: worker.database,
      ...scenario,
    });
    const query = async () => {
      await Promise.all([
        request("snapshot.list", {}),
        request("recording.library", {}),
        request("snapshot.list", { cameraId: cameras[0].id }),
        request("recording.library", {
          cameraId: cameras[0].id,
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: "2026-01-02T00:00:00.000Z",
        }),
      ]);
    };
    await query(); // warm-up outside the measurement
    queryCount = 0;
    const memoryBefore = process.memoryUsage();
    const startedAt = performance.now();
    for (let index = 0; index < repetitions; index += 1) await query();
    const elapsedMs = performance.now() - startedAt;
    const memoryAfter = process.memoryUsage();
    return {
      catalog: {
        cameras: scenario.cameraCount,
        recordings: scenario.cameraCount * scenario.recordingsPerCamera,
        snapshots: scenario.cameraCount * scenario.snapshotsPerCamera,
        segments: scenario.cameraCount * scenario.recordingsPerCamera,
      },
      repetitions,
      queryCount,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      averageLoadMs: Number((elapsedMs / repetitions).toFixed(2)),
      heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
    };
  } finally {
    worker.close();
  }
}

const results = {};
for (const scenario of scenarios) results[scenario.name] = await measureScenario(scenario);
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2));
