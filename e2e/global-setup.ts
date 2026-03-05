import { execAsync } from "./helper";

export default async function globalSetup() {
  await execAsync("pnpm db:migrate --persist-to .wrangler/state/e2e");
}
