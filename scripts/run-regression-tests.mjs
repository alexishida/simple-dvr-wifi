import { build } from "vite";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

await build({
  configFile: false,
  logLevel: "warn",
  build: {
    target: "node22",
    outDir: "out/tests",
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: {
        "regression.test": resolve("scripts/regression.test.mjs"),
        "database-regression.test": resolve(
          "scripts/database-regression.test.mjs",
        ),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.mjs`,
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith("node:") || id === "zod" || id === "better-sqlite3",
    },
  },
});

async function run(executable, file, env = process.env) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(executable, ["--test", file], {
      stdio: "inherit",
      windowsHide: true,
      env,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`Tests failed: ${file} (exit ${code})`)),
    );
  });
}

await run(process.execPath, "out/tests/regression.test.mjs");
// Use the same SQLite ABI as the desktop application, without opening a window.
const { default: electronExecutable } = await import("electron");
await run(electronExecutable, "out/tests/database-regression.test.mjs", {
  ...process.env,
  ELECTRON_RUN_AS_NODE: "1",
});
