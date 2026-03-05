import { exec } from "node:child_process";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";

export const execAsync = promisify(exec);

export async function setupDb(options: { seed?: boolean } = {}) {
  await execAsync(`pnpm db:clear --persist-to .wrangler/state/e2e`);
  if (options.seed) {
    await execAsync(`pnpm db:seed --persist-to .wrangler/state/e2e`);
  }
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Password").fill("dev");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
}
