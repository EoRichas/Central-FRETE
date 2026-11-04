import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Bound native pools before Next/SWC loads, including in its child workers.
// These limits apply to compilation only; they do not change the running server.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
  "build",
  "--webpack",
  ...process.argv.slice(2),
], {
  stdio: "inherit",
  env: {
    ...process.env,
    RAYON_NUM_THREADS: "1",
    TOKIO_WORKER_THREADS: "1",
  },
});

if (result.error) {
  console.error("Não foi possível iniciar o build:", result.error.message);
  process.exitCode = 1;
} else if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.status ?? 1;
}
