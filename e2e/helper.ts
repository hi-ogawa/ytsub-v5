import { exec } from "node:child_process";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";

export const execAsync = promisify(exec);

export async function setupDb(options: { seed?: boolean } = {}) {
  await execAsync(`pnpm db:clear --persist-to .wrangler/state/e2e`);
  if (options.seed) {
    await execAsync(`pnpm db:seed --persist-to .wrangler/state/e2e`);
  }
}

const BASE_URL = "http://localhost:5190";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Password").fill("dev");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
}

/** Login via API and save storageState for use with test.use({ storageState }) */
export async function setupAuth() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { password: "dev" } }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("No Set-Cookie header");
  const match = setCookie.match(/session=([^;]+)/);
  if (!match) throw new Error("No session cookie");
  // Write Playwright storageState format
  writeFileSync(
    "e2e/.auth.json",
    JSON.stringify({
      cookies: [
        {
          name: "session",
          value: match[1],
          domain: "localhost",
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
          expires: -1,
        },
      ],
      origins: [],
    }),
  );
}
