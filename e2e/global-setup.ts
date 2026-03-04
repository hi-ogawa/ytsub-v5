import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export default async function globalSetup() {
  await execAsync("pnpm db:clear && pnpm db:seed");
}
