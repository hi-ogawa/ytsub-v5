import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function dbReset({ seed = false } = {}) {
  await execAsync(`pnpm db:clear${seed ? " && pnpm db:seed" : ""}`);
}
