import { expect, test } from "@playwright/test";
import { setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb();
});

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

  test("register creates user and sets session cookie", async ({ request }) => {
    const res = await rpc(request, "auth/register", {
      email: "new@zamak.local",
      password: "testpassword",
    });
    expect(res.ok()).toBe(true);
    const body = await json(res);
    expect(body.ok).toBe(true);
    const setCookie = res.headers()["set-cookie"];
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("register duplicate email returns conflict", async ({ request }) => {
    // Register first
    await rpc(request, "auth/register", {
      email: "dup@zamak.local",
      password: "testpassword",
    });
    // Try again
    const res = await rpc(request, "auth/register", {
      email: "dup@zamak.local",
      password: "testpassword",
    });
    expect(res.status()).toBe(409);
  });

  test("login with wrong password returns 401", async ({ request }) => {
    // Register first
    await rpc(request, "auth/register", {
      email: "wrong-pw@zamak.local",
      password: "testpassword",
    });
    const res = await rpc(request, "auth/login", {
      email: "wrong-pw@zamak.local",
      password: "badpassword",
    });
    expect(res.status()).toBe(401);
  });

  test("login with correct password sets session cookie", async ({
    request,
  }) => {
    // Register first
    await rpc(request, "auth/register", {
      email: "login@zamak.local",
      password: "testpassword",
    });
    const res = await rpc(request, "auth/login", {
      email: "login@zamak.local",
      password: "testpassword",
    });
    expect(res.ok()).toBe(true);
    const setCookie = res.headers()["set-cookie"];
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("authenticated API calls succeed with cookie", async ({ request }) => {
    await rpc(request, "auth/register", {
      email: "authed@zamak.local",
      password: "testpassword",
    });

    // Now API calls should work (Playwright request context keeps cookies)
    const res = await rpc(request, "videos/listVideos", {});
    expect(res.ok()).toBe(true);
  });

  test("auth check returns status", async ({ request }) => {
    // Before login
    const before = await rpc(request, "auth/check");
    expect((await json(before)).authenticated).toBe(false);

    // Register
    await rpc(request, "auth/register", {
      email: "check@zamak.local",
      password: "testpassword",
    });

    // After register
    const after = await rpc(request, "auth/check");
    expect((await json(after)).authenticated).toBe(true);
  });

  test("logout clears session", async ({ request }) => {
    await rpc(request, "auth/register", {
      email: "logout@zamak.local",
      password: "testpassword",
    });

    const logoutRes = await rpc(request, "auth/logout");
    expect(logoutRes.ok()).toBe(true);
    const setCookie = logoutRes.headers()["set-cookie"];
    expect(setCookie).toContain("Max-Age=0");
  });
});
