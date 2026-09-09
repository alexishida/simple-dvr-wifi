import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";

if (!process.versions.electron) {
  const { build } = await import("vite");
  await build({
    configFile: false,
    logLevel: "warn",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    esbuild: { jsx: "automatic" },
    build: {
      outDir: "out/tests",
      emptyOutDir: false,
      lib: {
        entry: resolve("scripts/live-video-regression.mjs"),
        name: "liveVideoRegression",
        formats: ["iife"],
        fileName: () => "live-video-regression.js",
      },
    },
  });
  const { spawn } = await import("node:child_process");
  const { default: executable } = await import("electron");
  const testRoot = tmpdir();
  const userData = await mkdtemp(join(testRoot, "dvr-player-smoke-"));
  const env = { ...process.env, SWC_TEST_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise((resolveRun, reject) => {
      const child = spawn(
        executable,
        [resolve("scripts/live-video-smoke.mjs")],
        {
          env,
          stdio: "inherit",
          windowsHide: true,
        },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolveRun()
          : reject(new Error(`Player smoke failed: ${code}`)),
      );
    });
  } finally {
    const childPath = relative(testRoot, userData);
    if (childPath && !childPath.startsWith("..") && !isAbsolute(childPath)) {
      await rm(userData, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  }
} else {
  const { app, BrowserWindow } = await import("electron");
  app.setPath("userData", process.env.SWC_TEST_USER_DATA);
  const timeout = setTimeout(() => app.exit(1), 15_000);
  app.on("window-all-closed", () => {});
  let window;
  let exitCode = 0;
  void app
    .whenReady()
    .then(async () => {
      try {
        window = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        await window.loadURL("about:blank");
        const source = await readFile(
          resolve("out/tests/live-video-regression.js"),
          "utf8",
        );
        const result = await window.webContents.executeJavaScript(
          `${source}\nliveVideoRegression.run()`,
        );
        console.log("Live player lifecycle smoke passed:", result);
      } catch (error) {
        console.error(error);
        exitCode = 1;
      } finally {
        clearTimeout(timeout);
        window?.destroy();
        app.exit(exitCode);
      }
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
}
