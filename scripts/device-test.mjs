import { spawn } from "node:child_process";

// Harness de validação por dispositivo (tarefa 15.2). Executa o teste segmentado
// real contra uma câmera via vitest (que transpila o TypeScript) e imprime um
// JSON estruturado. Uso:
//   node scripts/device-test.mjs --onvif http://IP/onvif/device_service --user admin --pass senha [--rtsp rtsp://IP/stream] [--json out.json]

const argv = process.argv.slice(2);
function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key.startsWith("--")) {
      const name = key.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        out[name] = value;
        i++;
      } else {
        out[name] = true;
      }
    }
  }
  return out;
}

const args = parseArgs(argv);
if (!args.onvif) {
  console.error(
    "Uso: node scripts/device-test.mjs --onvif <url> [--user <user>] [--pass <pass>] [--rtsp <rtspUrl>] [--snapshot <uri>] [--json <arquivo>]",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  DEVICE_TEST_ONVIF_URL: args.onvif,
  DEVICE_TEST_USER: args.user ?? "",
  DEVICE_TEST_PASS: args.pass ?? "",
  DEVICE_TEST_RTSP_URL: args.rtsp ?? "",
  DEVICE_TEST_SNAPSHOT_URI: args.snapshot ?? "",
  DEVICE_TEST_JSON_OUT: args.json ?? "",
};

const child = spawn(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/device-validation.test.ts"],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);

child.once("exit", (code) => process.exit(code ?? 1));
child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
