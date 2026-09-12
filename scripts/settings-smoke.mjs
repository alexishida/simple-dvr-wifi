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
        entry: resolve("scripts/settings-regression.mjs"),
        name: "settingsRegression",
        formats: ["iife"],
        fileName: () => "settings-regression.js",
      },
    },
  });
  const { spawn } = await import("node:child_process");
  const { default: executable } = await import("electron");
  const testRoot = tmpdir();
  const userData = await mkdtemp(join(testRoot, "dvr-settings-smoke-"));
  const env = { ...process.env, SWC_TEST_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise((resolveRun, reject) => {
      const child = spawn(executable, [resolve("scripts/settings-smoke.mjs")], {
        env,
        stdio: "inherit",
        windowsHide: true,
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolveRun()
          : reject(new Error(`Settings smoke failed: ${code}`)),
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
            backgroundThrottling: false,
            offscreen: true,
          },
        });
        await window.loadURL("about:blank");
        const source = await readFile(
          resolve("out/tests/settings-regression.js"),
          "utf8",
        );
        const result = await window.webContents.executeJavaScript(
          `${source}\nsettingsRegression.run()`,
        );
        console.log("Settings interaction smoke passed:", result);
        await mkdir(resolve("test-results/settings"), { recursive: true });
        for (const width of [1440, 900, 390]) {
          window.setContentSize(width, 1000);
          await new Promise((resolveSize) => setTimeout(resolveSize, 100));
          for (const category of [
            "Aparência",
            "Armazenamento",
            "Vídeo e desempenho",
            "Conexão",
            "Diagnóstico",
          ]) {
            await window.webContents.executeJavaScript(`
              document.querySelectorAll('.settings-nav button').forEach(button => {
                if (button.textContent === ${JSON.stringify(category)}) button.click();
              });
            `);
            await new Promise((resolveRender) => setTimeout(resolveRender, 50));
            await window.webContents.executeJavaScript(
              `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
            );
            const overflow = await window.webContents.executeJavaScript(`
              document.documentElement.scrollWidth > innerWidth ||
              [...document.querySelectorAll('.settings-page, .settings-panel, .settings-control')]
                .some(element => element.scrollWidth > element.clientWidth + 1)
            `);
            if (overflow)
              throw new Error(`Layout overflow: ${width}, ${category}`);
            const screenshot = await window.webContents.capturePage();
            await writeFile(
              resolve("test-results/settings", `${width}-${category}.png`),
              screenshot.toPNG(),
            );
          }
        }
        console.log("Settings layout passed at 1440, 900 and 390 pixels.");
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
