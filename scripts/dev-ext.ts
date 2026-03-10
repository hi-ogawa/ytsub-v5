// wrapper script for `node --watch`.
// this works around some issues with `vite build --watch`.
import { spawn } from "node:child_process";

spawn("node", ["--run", "build-ext"], {
  stdio: "inherit",
  env: { ...process.env, DEV_EXT: "1" },
});
