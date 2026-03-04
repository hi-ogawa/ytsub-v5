import { expect, test } from "@playwright/test";

const rpc = (request: any, path: string, data: any = {}) =>
  request.post(`/api/${path.replace(/\./g, "/")}`, {
    headers: { "Content-Type": "application/json" },
    data: { json: data },
  });

const json = async (res: any) => {
  const body = await res.json();
  return body.json;
};

test.describe("auth endpoints", () => {
  test("unauthenticated API calls return 401", async ({ request }) => {
    const res = await rpc(request, "videos/listVideos", {});
    expect(res.status()).toBe(401);
  });

  test("login with wrong password returns 401", async ({ request }) => {
    const res = await rpc(request, "auth/login", { password: "wrong" });
    expect(res.status()).toBe(401);
  });

  test("login with correct password sets session cookie", async ({
    request,
  }) => {
    const res = await rpc(request, "auth/login", { password: "dev" });
    expect(res.ok()).toBe(true);
    const body = await json(res);
    expect(body.ok).toBe(true);
    const setCookie = res.headers()["set-cookie"];
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("authenticated API calls succeed with cookie", async ({ request }) => {
    // Login first
    await rpc(request, "auth/login", { password: "dev" });

    // Now API calls should work (Playwright request context keeps cookies)
    const res = await rpc(request, "videos/listVideos", {});
    expect(res.ok()).toBe(true);
  });

  test("auth check returns status", async ({ request }) => {
    // Before login
    const before = await rpc(request, "auth/check");
    expect((await json(before)).authenticated).toBe(false);

    // Login
    await rpc(request, "auth/login", { password: "dev" });

    // After login
    const after = await rpc(request, "auth/check");
    expect((await json(after)).authenticated).toBe(true);
  });

  test("logout clears session", async ({ request }) => {
    // Login
    await rpc(request, "auth/login", { password: "dev" });

    // Logout
    const logoutRes = await rpc(request, "auth/logout");
    expect(logoutRes.ok()).toBe(true);
    const setCookie = logoutRes.headers()["set-cookie"];
    expect(setCookie).toContain("Max-Age=0");
  });

  test("bearer password auth works", async ({ request }) => {
    const res = await request.post("/api/videos/listVideos", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dev",
      },
      data: { json: {} },
    });
    expect(res.ok()).toBe(true);
  });

  test("bearer wrong password returns 401", async ({ request }) => {
    const res = await request.post("/api/videos/listVideos", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong",
      },
      data: { json: {} },
    });
    expect(res.status()).toBe(401);
  });
});
