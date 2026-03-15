import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("shows toast on delete mutation error", async ({ page }) => {
  await login(page);

  // Intercept deleteVideo API and return 500
  await page.route("**/api/videos/deleteVideo", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ json: { message: "Server error" } }),
    }),
  );

  const card = page.getByRole("link", { name: /cloud palace/ });
  await expect(card).toBeVisible();

  // Trigger delete (accept confirmation dialog)
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByTestId("video-card-menu").click();
  await page.getByRole("menuitem", { name: /Delete/ }).click();

  // Error toast should appear
  const toast = page.locator("[data-sonner-toast][data-type='error']");
  await expect(toast).toBeVisible();
});

test("no toast on login error (inline error instead)", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("nonexistent");
  await page.getByPlaceholder("Password").fill("wrongpassword");
  await page.getByRole("button", { name: "Login" }).click();

  // Inline error should appear
  await expect(page.getByText("Invalid username or password")).toBeVisible();

  // No toast should appear
  const toast = page.locator("[data-sonner-toast][data-type='error']");
  await expect(toast).not.toBeVisible();
});
