import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { build } from "vite";

await build({
  configFile: false,
  logLevel: "warn",
  build: {
    target: "node22",
    outDir: "out/library-benchmark",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: resolve("scripts/media-library-benchmark.mjs"),
      formats: ["es"],
      fileName: () => "benchmark.mjs",
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith("node:") || id === "zod" || id === "better-sqlite3",
    },
  },
});

const { default: electronExecutable } = await import("electron");
await new Promise((resolveRun, reject) => {
  const child = spawn(electronExecutable, ["out/library-benchmark/benchmark.mjs"], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  child.once("error", reject);
  child.once("exit", (code) =>
    code === 0
      ? resolveRun()
      : reject(new Error(`Library benchmark failed (exit ${code})`)),
  );
});
