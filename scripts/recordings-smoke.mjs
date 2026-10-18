import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
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
        entry: resolve("scripts/recordings-regression.mjs"),
        name: "recordingsRegression",
        formats: ["iife"],
        fileName: () => "recordings-regression.js",
      },
    },
  });
  const { spawn } = await import("node:child_process");
  const { default: executable } = await import("electron");
  const testRoot = tmpdir();
  const userData = await mkdtemp(join(testRoot, "dvr-recordings-smoke-"));
  const env = { ...process.env, SWC_TEST_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise((resolveRun, reject) => {
      const child = spawn(
        executable,
        [resolve("scripts/recordings-smoke.mjs")],
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
          : reject(new Error(`Recordings smoke failed: ${code}`)),
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
  const timeout = setTimeout(() => app.exit(1), 30_000);
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
            backgroundThrottling: false,
            offscreen: true,
          },
        });
        await window.loadURL("about:blank");
        const source = await readFile(
          resolve("out/tests/recordings-regression.js"),
          "utf8",
        );
        const result = await window.webContents.executeJavaScript(
          `${source}\nrecordingsRegression.run()`,
        );
        console.log("Recordings interaction smoke passed:", result);
        await mkdir(resolve("test-results/recordings"), { recursive: true });
        for (const width of [1440, 900, 390]) {
          window.setContentSize(width, 1000);
          await new Promise((resolveSize) => setTimeout(resolveSize, 100));
          for (const category of ["library", "timeline", "list", "sd-card"]) {
            await window.webContents.executeJavaScript(`
              (() => {
              document.getElementById('recordings-tab-' + ${JSON.stringify(category === "sd-card" ? "sd-card" : "library")}).click();
              const timeline = document.querySelector('.recording-timeline-disclosure');
              if (timeline) timeline.open = ${category === "timeline"};
              const display = document.querySelector('.library-display-options');
              if (display) display.open = ${category === "list"};
              const layout = document.getElementById('library-layout-recordings');
              if (layout) {
                Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(layout, ${JSON.stringify(category === "list" ? "list" : "grid")});
                layout.dispatchEvent(new Event('change', { bubbles: true }));
              }
              })();
            `);
            await new Promise((resolveRender) =>
              setTimeout(resolveRender, 100),
            );
            const overflow = await window.webContents.executeJavaScript(`
              [...document.querySelectorAll('.recordings-page, .recording-search, .recording-date-range, .recording-card, .sd-card-panel, .recording-timeline-header, .recording-timeline-filters')]
                .filter(element => element.getClientRects().length)
                .filter(element => element.scrollWidth > element.clientWidth + 1)
                .map(element => ({ class: element.className, width: element.clientWidth, scroll: element.scrollWidth }))
            `);
            if (overflow.length)
              throw new Error(
                `Layout overflow: ${width}, ${category}: ${JSON.stringify(overflow)}`,
              );
            const screenshot = await window.webContents.capturePage();
            await writeFile(
              resolve("test-results/recordings", `${width}-${category}.png`),
              screenshot.toPNG(),
            );
          }
        }
        console.log("Recordings layout passed at 1440, 900 and 390 pixels.");
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
