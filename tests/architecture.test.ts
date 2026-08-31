import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("renderer boundary", () => {
  it("does not import Electron or Node modules", async () => {
    const [app, main] = await Promise.all([
      readFile(new URL("../src/renderer/App.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/renderer/main.tsx", import.meta.url), "utf8"),
    ]);

    expect(`${app}\n${main}`).not.toMatch(/from ['"](?:electron|node:)/);
  });

  it("keeps the Electron security baseline enabled", async () => {
    const main = await readFile(
      new URL("../src/main/index.ts", import.meta.url),
      "utf8",
    );

    expect(main).toContain("app.enableSandbox()");
    expect(main).toContain("sandbox: true");
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("webSecurity: true");
    expect(main).toMatch(/protocol\.handle\(["']app["']/);
    expect(main).toMatch(
      /setWindowOpenHandler\(\(\) => \(\{ action: ["']deny["'] \}\)\)/,
    );
  });

  it("keeps the preload API narrow, typed and channel-restricted", async () => {
    const preload = await readFile(
      new URL("../src/preload/index.ts", import.meta.url),
      "utf8",
    );

    expect(preload).toContain("ipcRenderer.invoke('cameras:list')");
    expect(preload).toContain("ipcRenderer.invoke('shell:openExternal'");
    expect(preload).not.toMatch(/invoke:\s*\(/);
    expect(preload).toMatch(/EVENT_CHANNELS\.includes\(channel\)/);
    expect(preload).toContain("contextBridge.exposeInMainWorld");
  });

  it("registers events only through a channel allowlist with unsubscribe", async () => {
    const preload = await readFile(
      new URL("../src/preload/index.ts", import.meta.url),
      "utf8",
    );

    expect(preload).toContain("subscribe('cameras:changed'");
    expect(preload).toContain("ipcRenderer.removeListener");
  });
});
