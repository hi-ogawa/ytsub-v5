// a wrapper script to be used with `node --watch`.
import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
spawn(command, args, {
  stdio: "inherit",
});
