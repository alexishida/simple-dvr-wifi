import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const media = Buffer.from("simple-dvr-fixture\n");

async function writeFixtureFile(root, relativePath, contents) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  return path;
}

function setRecordingInterval(database, id, startedAt, endedAt) {
  database
    .prepare(
      `UPDATE recordings
       SET status = 'completed', started_at = ?, ended_at = ?,
           duration_ms = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(startedAt, endedAt, Date.parse(endedAt) - Date.parse(startedAt), endedAt, id);
}

/**
 * Creates an isolated, representative media library.  The returned paths are
 * relative to libraryRoot, exactly as the production catalogue stores them.
 */
export async function createMediaLibraryFixture({ request, database, libraryRoot }) {
  const entrance = await request("camera.create", {
    name: "Entrada",
    host: "entrada.fixture.local",
  });
  const garage = await request("camera.create", {
    name: "Garagem",
    host: "garagem.fixture.local",
  });
  const disabled = await request("camera.create", {
    name: "Depósito desativado",
    host: "deposito.fixture.local",
  });

  const existingSnapshotPath = "snapshots/entrada/2026-01-10/080000.jpg";
  const missingSnapshotPath = "snapshots/deposito/2026-01-10/missing.jpg";
  await writeFixtureFile(libraryRoot, existingSnapshotPath, jpeg);
  const entranceSnapshot = await request("snapshot.create", {
    cameraId: entrance.id,
    path: existingSnapshotPath,
  });
  const missingSnapshot = await request("snapshot.create", {
    cameraId: disabled.id,
    path: missingSnapshotPath,
  });
  database
    .prepare("UPDATE snapshots SET captured_at = ? WHERE id = ?")
    .run("2026-01-10T08:00:00.000Z", entranceSnapshot.id);
  database
    .prepare("UPDATE snapshots SET captured_at = ? WHERE id = ?")
    .run("2026-01-10T08:15:00.000Z", missingSnapshot.id);

  const recording = await request("recording.create", { cameraId: entrance.id });
  const segments = [
    ["recordings/entrada/2026-01-10/080000.m4s", "2026-01-10T08:00:00.000Z", "2026-01-10T08:05:00.000Z"],
    ["recordings/entrada/2026-01-10/080500.m4s", "2026-01-10T08:05:00.000Z", "2026-01-10T08:10:00.000Z"],
    ["recordings/entrada/2026-01-10/081200.m4s", "2026-01-10T08:12:00.000Z", "2026-01-10T08:17:00.000Z"],
  ];
  for (const [path, startedAt, endedAt] of segments) {
    await writeFixtureFile(libraryRoot, path, media);
    await request("recording.segment.create", {
      recordingId: recording.id,
      path,
      startedAt,
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(startedAt),
      status: "completed",
    });
  }
  setRecordingInterval(database, recording.id, segments[0][1], segments.at(-1)[2]);

  const unavailableRecording = await request("recording.create", { cameraId: disabled.id });
  const missingSegmentPath = "recordings/deposito/2026-01-10/missing.m4s";
  await request("recording.segment.create", {
    recordingId: unavailableRecording.id,
    path: missingSegmentPath,
    startedAt: "2026-01-10T09:00:00.000Z",
    endedAt: "2026-01-10T09:05:00.000Z",
    durationMs: 5 * 60_000,
    status: "completed",
  });
  setRecordingInterval(
    database,
    unavailableRecording.id,
    "2026-01-10T09:00:00.000Z",
    "2026-01-10T09:05:00.000Z",
  );
  await request("camera.deactivate", { id: disabled.id });

  return {
    cameras: { entrance, garage, disabled },
    snapshots: { entranceSnapshot, missingSnapshot },
    recordings: { recording, unavailableRecording },
    paths: { existingSnapshotPath, missingSnapshotPath, missingSegmentPath },
    gap: {
      startsAt: "2026-01-10T08:10:00.000Z",
      endsAt: "2026-01-10T08:12:00.000Z",
    },
  };
}

/** Seeds a deterministic catalogue without media files for performance tests. */
export async function seedMediaLibraryCatalog({
  request,
  database,
  cameraCount,
  recordingsPerCamera,
  snapshotsPerCamera,
}) {
  const cameras = [];
  const insertRecording = database.prepare(
    `INSERT INTO recordings
     (id, camera_id, status, started_at, ended_at, duration_ms, created_at, updated_at)
     VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)`,
  );
  const insertSegment = database.prepare(
    `INSERT INTO recording_segments
     (id, recording_id, path, started_at, ended_at, duration_ms, status)
     VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
  );
  const insertSnapshot = database.prepare(
    "INSERT INTO snapshots (id, camera_id, path, captured_at) VALUES (?, ?, ?, ?)",
  );

  for (let cameraIndex = 0; cameraIndex < cameraCount; cameraIndex += 1) {
    const camera = await request("camera.create", {
      name: `Câmera de medição ${cameraIndex + 1}`,
      host: `benchmark-${cameraIndex + 1}.fixture.local`,
    });
    cameras.push(camera);
    const baseMs = Date.parse("2026-01-01T00:00:00.000Z") + cameraIndex * 60_000;
    for (let index = 0; index < recordingsPerCamera; index += 1) {
      const startedAt = new Date(baseMs + index * 10 * 60_000).toISOString();
      const endedAt = new Date(baseMs + (index * 10 + 5) * 60_000).toISOString();
      const recordingId = randomUUID();
      insertRecording.run(recordingId, camera.id, startedAt, endedAt, 5 * 60_000, startedAt, endedAt);
      insertSegment.run(
        randomUUID(),
        recordingId,
        `recordings/camera-${cameraIndex + 1}/${index}.m4s`,
        startedAt,
        endedAt,
        5 * 60_000,
      );
    }
    for (let index = 0; index < snapshotsPerCamera; index += 1) {
      const capturedAt = new Date(baseMs + index * 4 * 60_000).toISOString();
      insertSnapshot.run(
        randomUUID(),
        camera.id,
        `snapshots/camera-${cameraIndex + 1}/${index}.jpg`,
        capturedAt,
      );
    }
  }
  return cameras;
}

export async function removeFixtureFile(root, relativePath) {
  await unlink(join(root, relativePath)).catch(() => undefined);
}
