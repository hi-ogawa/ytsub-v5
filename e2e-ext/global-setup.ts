import { execAsync } from "../e2e/helper";

export default async function globalSetup() {
  await execAsync("pnpm db:migrate --persist-to .wrangler/state/e2e-ext");
}
