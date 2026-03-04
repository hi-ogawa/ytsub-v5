import { execAsync } from "./helper";

export default async function globalSetup() {
  await execAsync("pnpm db:reset --persist-to .wrangler/state/e2e");
}
