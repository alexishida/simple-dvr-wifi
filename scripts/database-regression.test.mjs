import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
