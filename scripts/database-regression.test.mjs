import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import Database from "better-sqlite3";
import {
  runMigrations,
  MIGRATIONS,
} from "../src/workers/database/migrations.ts";
import { SqliteWorker } from "../src/workers/database/worker.ts";
import { CredentialService } from "../src/main/services/credentials.ts";
import {
  DatabaseSupervisor,
  createInMemoryTransport,
} from "../src/main/supervisors/database.ts";
import { createMediaLibraryFixture } from "./media-library-fixtures.mjs";

function memoryDatabase(t) {
  const worker = new SqliteWorker(MIGRATIONS);
  worker.open(":memory:");
  t.after(() => worker.close());
  return {
    worker,
    request: async (op, payload) => {
      const response = await worker.dispatch({ id: "test", op, payload });
      assert.equal(response.ok, true, JSON.stringify(response));
      return response.value;
    },
  };
}

test('importing an SD card recording preserves the camera time and is idempotent', async (t) => {
  const { worker, request } = memoryDatabase(t)
  const camera = await request('camera.create', { name: 'Mibo', host: '192.168.0.10' })
  const input = {
    cameraId: camera.id,
    path: 'C:/recordings/sd-card/example.mp4',
    startedAt: '2026-09-27T21:10:46.000Z',
    endedAt: '2026-09-27T21:11:20.000Z',
    durationMs: 34_000,
  }
  const first = await request('recording.importSdCard', input)
  const second = await request('recording.importSdCard', input)
  assert.equal(first.id, second.id)
  assert.equal(first.startedAt, input.startedAt)
  assert.equal(first.endedAt, input.endedAt)
  assert.equal(first.durationMs, input.durationMs)
  assert.equal(worker.database.prepare('SELECT COUNT(*) AS count FROM recordings').get().count, 1)
  const segments = await request('recording.segment.list', { recordingId: first.id })
  assert.equal(segments.length, 1)
  assert.equal(segments[0].path, input.path)
})

test("failed camera endpoint insertion rolls back the entire camera", async (t) => {
  const { worker, request } = memoryDatabase(t);
  const response = await worker.dispatch({
    id: "invalid-camera",
    op: "camera.create",
    payload: {
      name: "Incomplete camera",
      host: "127.0.0.1",
      endpoints: [
        { service: "rtsp", url: "rtsp://127.0.0.1/live" },
        { service: "onvif", url: null },
      ],
    },
  });
  assert.equal(response.ok, false);
  assert.deepEqual(await request("camera.listAll"), []);
  assert.equal(
    worker.database.prepare("SELECT COUNT(*) AS n FROM camera_endpoints").get()
      .n,
    0,
  );
});

test("snapshot library includes inactive cameras and supports filtering", async (t) => {
  const { worker, request } = memoryDatabase(t);
  const active = await request("camera.create", {
    name: "Active",
    host: "active.local",
  });
  const inactive = await request("camera.create", {
    name: "Inactive",
    host: "inactive.local",
  });
  const first = await request("snapshot.create", {
    cameraId: active.id,
    path: "first.jpg",
  });
  const last = await request("snapshot.create", {
    cameraId: inactive.id,
    path: "last.jpg",
  });
  worker.database
    .prepare("UPDATE snapshots SET captured_at = ? WHERE id = ?")
    .run("2026-01-01T00:00:00.000Z", first.id);
  worker.database
    .prepare("UPDATE snapshots SET captured_at = ? WHERE id = ?")
    .run("2026-01-02T00:00:00.000Z", last.id);
  await request("camera.deactivate", { id: inactive.id });
  assert.deepEqual(
    (await request("snapshot.list", {})).map((row) => row.id),
    [last.id, first.id],
  );
  assert.deepEqual(
    (await request("snapshot.list", { cameraId: inactive.id })).map(
      (row) => row.id,
    ),
    [last.id],
  );
  assert.deepEqual(await request("snapshot.list", { cameraId: "missing" }), []);
});

test("recording library returns first segments, empty recordings and inactive cameras", async (t) => {
  const { worker, request } = memoryDatabase(t);
  const active = await request("camera.create", {
    name: "Active",
    host: "active.local",
  });
  const inactive = await request("camera.create", {
    name: "Inactive",
    host: "inactive.local",
  });
  const first = await request("recording.create", { cameraId: inactive.id });
  const last = await request("recording.create", { cameraId: active.id });
  worker.database
    .prepare("UPDATE recordings SET started_at = ? WHERE id = ?")
    .run("2026-01-01T00:00:00.000Z", first.id);
  worker.database
    .prepare("UPDATE recordings SET started_at = ? WHERE id = ?")
    .run("2026-01-02T00:00:00.000Z", last.id);
  await request("recording.segment.create", {
    recordingId: first.id,
    path: "later.mp4",
    startedAt: "2026-01-01T00:01:00.000Z",
  });
  await request("recording.segment.create", {
    recordingId: first.id,
    path: "first.mp4",
    startedAt: "2026-01-01T00:00:00.000Z",
  });
  await request("camera.deactivate", { id: inactive.id });
  const list = await request("recording.library", {});
  assert.deepEqual(
    list.map(({ id, path }) => ({ id, path })),
    [
      { id: last.id, path: null },
      { id: first.id, path: "first.mp4" },
    ],
  );
  assert.deepEqual(
    await request("recording.library", { cameraId: inactive.id }),
    [list[1]],
  );
  assert.deepEqual(
    await request("recording.library", { cameraId: "missing" }),
    [],
  );
});

test("library date filters use snapshot instants and recording interval overlap", async (t) => {
  const { worker, request } = memoryDatabase(t);
  const camera = await request("camera.create", {
    name: "Camera",
    host: "camera.local",
  });
  const early = await request("snapshot.create", {
    cameraId: camera.id,
    path: "early.jpg",
  });
  const target = await request("snapshot.create", {
    cameraId: camera.id,
    path: "target.jpg",
  });
  worker.database
    .prepare("UPDATE snapshots SET captured_at = ? WHERE id = ?")
    .run("2026-01-04T23:59:59.999Z", early.id);
  worker.database
    .prepare("UPDATE snapshots SET captured_at = ? WHERE id = ?")
    .run("2026-01-05T00:00:00.000Z", target.id);

  const overlapping = await request("recording.create", { cameraId: camera.id });
  const outside = await request("recording.create", { cameraId: camera.id });
  worker.database
    .prepare("UPDATE recordings SET started_at = ?, ended_at = ? WHERE id = ?")
    .run(
      "2026-01-04T23:00:00.000Z",
      "2026-01-05T01:00:00.000Z",
      overlapping.id,
    );
  worker.database
    .prepare("UPDATE recordings SET started_at = ?, ended_at = ? WHERE id = ?")
    .run(
      "2026-01-03T23:00:00.000Z",
      "2026-01-04T23:59:59.999Z",
      outside.id,
    );

  const filters = {
    startAt: "2026-01-05T00:00:00.000Z",
    endAt: "2026-01-06T00:00:00.000Z",
  };
  assert.deepEqual(
    (await request("snapshot.list", filters)).map((snapshot) => snapshot.id),
    [target.id],
  );
  assert.deepEqual(
    (await request("recording.library", filters)).map((recording) => recording.id),
    [overlapping.id],
  );
});

test("media-library fixture covers cameras, gaps, inactive cameras, and missing files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dvr-media-library-fixture-"));
  const { worker, request } = memoryDatabase(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createMediaLibraryFixture({
    request,
    database: worker.database,
    libraryRoot: root,
  });

  await assert.doesNotReject(() => access(join(root, fixture.paths.existingSnapshotPath)));
  await assert.rejects(() => access(join(root, fixture.paths.missingSnapshotPath)));
  await assert.rejects(() => access(join(root, fixture.paths.missingSegmentPath)));
  assert.equal((await request("camera.listAll", {})).find((camera) => camera.id === fixture.cameras.disabled.id).active, false);
  assert.deepEqual(
    (await request("recording.segment.list", { recordingId: fixture.recordings.recording.id }))
      .map((segment) => [segment.startedAt, segment.endedAt]),
    [
      ["2026-01-10T08:00:00.000Z", "2026-01-10T08:05:00.000Z"],
      ["2026-01-10T08:05:00.000Z", "2026-01-10T08:10:00.000Z"],
      ["2026-01-10T08:12:00.000Z", "2026-01-10T08:17:00.000Z"],
    ],
  );
  assert.deepEqual(fixture.gap, {
    startsAt: "2026-01-10T08:10:00.000Z",
    endsAt: "2026-01-10T08:12:00.000Z",
  });
});

test("media metadata persists, validates source recordings, and follows media deletion", async (t) => {
  const { worker, request } = memoryDatabase(t);
  const camera = await request("camera.create", {
    name: "Camera",
    host: "camera.local",
  });
  const otherCamera = await request("camera.create", {
    name: "Other camera",
    host: "other.local",
  });
  const snapshot = await request("snapshot.create", {
    cameraId: camera.id,
    path: "snapshot.jpg",
  });
  const recording = await request("recording.create", { cameraId: camera.id });
  const otherRecording = await request("recording.create", {
    cameraId: otherCamera.id,
  });

  const stored = await request("media.metadata.upsert", {
    kind: "snapshot",
    mediaId: snapshot.id,
    favorite: true,
    protected: true,
    tags: ["entrada", "noite"],
    note: "Movimento confirmado.",
    sourceRecordingId: recording.id,
    sourcePositionMs: 12_500,
  });
  assert.equal(stored.favorite, true);
  assert.equal(stored.protected, true);
  assert.deepEqual(stored.tags, ["entrada", "noite"]);
  assert.equal(stored.sourceRecordingId, recording.id);
  assert.equal(stored.sourcePositionMs, 12_500);
  assert.match(stored.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    await request("media.metadata.get", {
      kind: "snapshot",
      mediaId: snapshot.id,
    }),
    stored,
  );

  const mismatchedSource = await worker.dispatch({
    id: "mismatched-source",
    op: "media.metadata.upsert",
    payload: {
      kind: "snapshot",
      mediaId: snapshot.id,
      favorite: false,
      protected: false,
      tags: [],
      note: "",
      sourceRecordingId: otherRecording.id,
      sourcePositionMs: null,
    },
  });
  assert.deepEqual(mismatchedSource, {
    id: "mismatched-source",
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "A gravação de origem deve pertencer à mesma câmera.",
      retryable: false,
    },
  });

  const invalidRecordingSource = await worker.dispatch({
    id: "recording-source",
    op: "media.metadata.upsert",
    payload: {
      kind: "recording",
      mediaId: recording.id,
      favorite: false,
      protected: false,
      tags: [],
      note: "",
      sourceRecordingId: recording.id,
      sourcePositionMs: null,
    },
  });
  assert.equal(invalidRecordingSource.ok, false);
  if (!invalidRecordingSource.ok) {
    assert.equal(invalidRecordingSource.error.code, "VALIDATION_ERROR");
  }

  await request("snapshot.delete", { id: snapshot.id });
  assert.equal(
    await request("media.metadata.get", {
      kind: "snapshot",
      mediaId: snapshot.id,
    }),
    null,
  );
});

test("media metadata migration upgrades an existing version 1 database", () => {
  const db = new Database(":memory:");
  try {
    runMigrations(db, {}, [MIGRATIONS[0]]);
    assert.throws(() => db.prepare("SELECT * FROM media_metadata"));
    const result = runMigrations(db, {}, MIGRATIONS);
    assert.deepEqual(result.applied, [2, 3, 4]);
    assert.doesNotThrow(() => db.prepare("SELECT * FROM media_metadata"));
  } finally {
    db.close();
  }
});

test("stored credentials round-trip without plaintext in the SQLite file", async (t) => {
  const root = tmpdir();
  const directory = await mkdtemp(join(root, "dvr-credentials-test-"));
  const path = join(directory, "credentials.sqlite");
  const worker = new SqliteWorker(MIGRATIONS);
  t.after(async () => {
    worker.close();
    const child = relative(root, directory);
    assert.ok(child && !child.startsWith("..") && !isAbsolute(child));
    await rm(directory, { recursive: true, force: true });
  });
  worker.open(path);
  const database = new DatabaseSupervisor(createInMemoryTransport(worker));
  let wrappedKey;
  // OS wrapping is injected; the production vault and repository perform encryption/storage.
  const keyStore = {
    isEncryptionAvailable: () => true,
    wrap: (key) => {
      wrappedKey = Buffer.from(key);
      return Buffer.from("opaque-test-key-reference");
    },
    unwrap: () => Buffer.from(wrappedKey),
  };
  const credentials = new CredentialService(database, keyStore);
  await credentials.initialize();
  const camera = await database.request("camera.create", {
    name: "Test camera",
    host: "127.0.0.1",
  });
  assert.equal(camera.ok, true);
  const expected = {
    username: "canary-private-user",
    password: "canary-private-password-94723",
  };
  await credentials.setCredential(camera.value.id, {
    service: "rtsp",
    ...expected,
  });
  const reopened = new CredentialService(database, keyStore);
  await reopened.initialize();
  assert.deepEqual(
    await reopened.getCredentialDetails(camera.value.id, "rtsp"),
    expected,
  );
  await database.close();
  const contents = await readFile(path);
  assert.equal(contents.includes(Buffer.from(expected.username)), false);
  assert.equal(contents.includes(Buffer.from(expected.password)), false);
});

test("pre-migration backup includes committed WAL data and the original schema", async () => {
  const root = tmpdir();
  const directory = await mkdtemp(join(root, "dvr-database-test-"));
  const path = join(directory, "source.sqlite");
  const db = new Database(path);
  let backup;
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("wal_autocheckpoint = 0");
    db.exec("CREATE TABLE original (id INTEGER PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO original (value) VALUES (?)").run(
      "committed in WAL",
    );
    const result = runMigrations(db, { dbPath: path, backupDir: directory }, [
      {
        version: 1,
        name: "drop-original",
        destructive: true,
        up: (connection) => connection.exec("DROP TABLE original"),
      },
    ]);
    backup = new Database(result.backupPath, { readonly: true });
    assert.equal(
      backup.prepare("SELECT value FROM original").get().value,
      "committed in WAL",
    );
    assert.throws(() => db.prepare("SELECT * FROM original"));
    assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    backup?.close();
    db.close();
    const child = relative(root, directory);
    assert.ok(child && !child.startsWith("..") && !isAbsolute(child));
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed migrations leave the worker uninitialized and allow a subsequent open", () => {
  let fail = true;
  const worker = new SqliteWorker([
    {
      version: 1,
      name: "failure",
      destructive: false,
      up: () => {
        if (fail) throw new Error("migration failed");
      },
    },
  ]);
  assert.throws(() => worker.open(":memory:"));
  assert.equal(worker.isReady(), false);
  fail = false;
  worker.open(":memory:");
  assert.equal(worker.isReady(), true);
  worker.close();
});
