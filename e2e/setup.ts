import { test as setup } from "@playwright/test";

setup("authenticate", async ({ request }) => {
  await request.post("/api/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: { json: { password: "dev" } },
  });
  await request.storageState({ path: "e2e/.auth.json" });
});
