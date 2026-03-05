import { exec } from "node:child_process";
import { promisify } from "node:util";

export const execAsync = promisify(exec);

export async function setupDb(options: { seed?: boolean } = {}) {
  await execAsync(`pnpm db:clear --persist-to .wrangler/state/e2e`);
  if (options.seed) {
    await execAsync(`pnpm db:seed --persist-to .wrangler/state/e2e`);
  }
}

