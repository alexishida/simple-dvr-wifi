import { readFile, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

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
        entry: resolve("scripts/camera-form-regression.mjs"),
        name: "cameraFormRegression",
        formats: ["iife"],
        fileName: () => "camera-form-regression.js",
      },
    },
  });
  const { spawn } = await import("node:child_process");
  const { default: executable } = await import("electron");
  const userData = await mkdtemp(
    join(resolve("out/tests"), "camera-form-profile-"),
  );
  const env = { ...process.env, CAMERA_FORM_TEST_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolveRun, reject) => {
    const child = spawn(
      executable,
      [resolve("scripts/camera-form-smoke.mjs")],
      { env, stdio: "inherit", windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`Camera form smoke failed: ${code}`)),
    );
  });
} else {
  const { app, BrowserWindow } = await import("electron");
  app.setPath("userData", process.env.CAMERA_FORM_TEST_DATA);
  const timeout = setTimeout(() => app.exit(1), 20_000);
  let window;
  void (async () => {
    try {
      await app.whenReady();
      console.log("Camera form: Electron ready");
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
      console.log("Camera form: test window loaded");
      const source = await readFile(
        resolve("out/tests/camera-form-regression.js"),
        "utf8",
      );
      console.log(
        await window.webContents.executeJavaScript(
          `${source}\ncameraFormRegression.run()`,
        ),
      );
      await mkdir(resolve("test-results/camera-form"), { recursive: true });
      for (const width of [1440, 900, 390]) {
        window.setContentSize(width, 1000);
        await new Promise((resolveSize) => setTimeout(resolveSize, 100));
        const overflow = await window.webContents.executeJavaScript(
          "document.documentElement.scrollWidth > innerWidth",
        );
        if (overflow)
          throw new Error(`Camera form layout overflow at ${width}px`);
        await writeFile(
          resolve(`test-results/camera-form/${width}.png`),
          (await window.webContents.capturePage()).toPNG(),
        );
      }
      console.log("Camera form layout passed at 1440, 900 and 390 pixels.");
      clearTimeout(timeout);
      window.destroy();
      app.exit(0);
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      window?.destroy();
      app.exit(1);
    }
  })();
}
