import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  expectedMediaMtxHashFromManifest,
  loadMediaBinaryManifest,
  mediaMtxManifestPath,
} from "../src/workers/media/mediamtx-config.js";

const MANIFEST = {
  components: [
    {
      id: "mediamtx",
      platform: "win32",
      fileName: "mediamtx.exe",
      version: "v1.20.0",
      origin: "https://github.com/bluenviron/mediamtx/releases/tag/v1.20.0",
      license: "MIT",
      fileSha256:
        "6149B1854800295CC2578BCFC20DFB965F4B2FD5ACFE7B3D3D41FE2F5CBD38DF",
      status: "approved",
    },
    {
      id: "ffmpeg",
      platform: "win32",
      fileName: "ffmpeg.exe",
      version: null,
      origin: null,
      license: "LGPL-2.1-or-later",
      fileSha256: null,
      status: "pending",
    },
  ],
};

const originalEnv = { ...process.env };

describe("manifest de binários de mídia", () => {
  let dir: string;
  let manifestPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "swc-manifest-"));
    manifestPath = join(dir, "media-binaries.json");
    writeFileSync(manifestPath, JSON.stringify(MANIFEST));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves the approved media binary entry by id and platform", () => {
    const entry = loadMediaBinaryManifest(manifestPath, "win32");
    expect(entry?.id).toBe("mediamtx");
    expect(entry?.fileSha256).toBe(
      "6149B1854800295CC2578BCFC20DFB965F4B2FD5ACFE7B3D3D41FE2F5CBD38DF",
    );
    expect(entry?.status).toBe("approved");
  });

  it("ignores entries of other platforms or ids", () => {
    expect(loadMediaBinaryManifest(manifestPath, "linux")).toBeNull();
  });

  it("returns empty hash for manifest that does not exist", () => {
    expect(expectedMediaMtxHashFromManifest(join(dir, "missing.json"))).toBe(
      "",
    );
  });

  it("returns the approved file hash from the manifest by default", () => {
    delete process.env.MEDIAMTX_EXPECTED_SHA256;
    expect(expectedMediaMtxHashFromManifest(manifestPath)).toBe(
      "6149B1854800295CC2578BCFC20DFB965F4B2FD5ACFE7B3D3D41FE2F5CBD38DF",
    );
  });

  it("returns empty hash when the entry is not approved", () => {
    const pending = {
      ...MANIFEST,
      components: [{ ...MANIFEST.components[0]!, status: "pending" }],
    };
    const pendingPath = join(dir, "pending.json");
    writeFileSync(pendingPath, JSON.stringify(pending));
    delete process.env.MEDIAMTX_EXPECTED_SHA256;
    expect(expectedMediaMtxHashFromManifest(pendingPath)).toBe("");
  });

  it("prefers the env override when present", () => {
    process.env.MEDIAMTX_EXPECTED_SHA256 = "OVERRIDE";
    expect(expectedMediaMtxHashFromManifest(manifestPath)).toBe("OVERRIDE");
  });

  it("resolves the manifest path under a resources root", () => {
    expect(mediaMtxManifestPath("C:\\resources")).toBe(
      "C:\\resources\\media-binaries.json",
    );
  });
});
