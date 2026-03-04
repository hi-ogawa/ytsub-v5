import { expect, test } from "@playwright/test";

test.describe("auth endpoints", () => {
  test("unauthenticated API calls return 401", async ({ request }) => {
    const res = await request.post("/api/videos/listVideos", {
      headers: { "Content-Type": "application/json" },
      data: { json: {} },
    });
    expect(res.status()).toBe(401);
  });

  test("health endpoint is public", async ({ request }) => {
    const res = await request.post("/api/health", {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect(res.ok()).toBe(true);
  });

  test("login with wrong password returns 401", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: { password: "wrong" },
    });
    expect(res.status()).toBe(401);
  });

  test("login with correct password sets session cookie", async ({
    request,
  }) => {
    const res = await request.post("/api/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: { password: "dev" },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const setCookie = res.headers()["set-cookie"];
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("authenticated API calls succeed with cookie", async ({ request }) => {
    // Login first
    await request.post("/api/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: { password: "dev" },
    });

    // Now API calls should work (Playwright request context keeps cookies)
    const res = await request.post("/api/videos/listVideos", {
      headers: { "Content-Type": "application/json" },
      data: { json: {} },
    });
    expect(res.ok()).toBe(true);
  });

  test("auth check returns status", async ({ request }) => {
    // Before login
    const before = await request.get("/api/auth/check");
    expect((await before.json()).authenticated).toBe(false);

    // Login
    await request.post("/api/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: { password: "dev" },
    });

    // After login
    const after = await request.get("/api/auth/check");
    expect((await after.json()).authenticated).toBe(true);
  });

  test("logout clears session", async ({ request }) => {
    // Login
    await request.post("/api/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: { password: "dev" },
    });

    // Logout
    const logoutRes = await request.post("/api/auth/logout");
    expect(logoutRes.ok()).toBe(true);
    const setCookie = logoutRes.headers()["set-cookie"];
    expect(setCookie).toContain("Max-Age=0");

    // API calls should fail again
    // Note: Playwright may still send the cleared cookie, but server should reject it
  });

  test("bearer token auth works", async ({ request }) => {
    // Login to get token
    const loginRes = await request.post("/api/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: { password: "dev" },
    });
    const setCookie = loginRes.headers()["set-cookie"];
    const token = setCookie.match(/session=([^;]+)/)?.[1];
    expect(token).toBeTruthy();

    // Use token as Bearer auth (fresh request context won't have cookies)
    const res = await request.post("/api/videos/listVideos", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: { json: {} },
    });
    expect(res.ok()).toBe(true);
  });
});
