import { expect, test } from "@playwright/test";
import { createUsername } from "./helper.ts";

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
    const username = createUsername();
    const res = await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });
    expect(res.ok()).toBe(true);
    const body = await json(res);
    expect(body.ok).toBe(true);
    const setCookie = res.headers()["set-cookie"];
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("register duplicate username returns conflict", async ({ request }) => {
    const username = createUsername();
    // Register first
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });
    // Try again
    const res = await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });
    expect(res.status()).toBe(409);
  });

  test("login with wrong password returns 401", async ({ request }) => {
    const username = createUsername();
    // Register first
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });
    const res = await rpc(request, "auth/login", {
      username,
      password: "badpassword",
    });
    expect(res.status()).toBe(401);
  });

  test("login with correct password sets session cookie", async ({
    request,
  }) => {
    const username = createUsername();
    // Register first
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });
    const res = await rpc(request, "auth/login", {
      username,
      password: "testpassword",
    });
    expect(res.ok()).toBe(true);
    const setCookie = res.headers()["set-cookie"];
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("authenticated API calls succeed with cookie", async ({ request }) => {
    const username = createUsername();
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });

    // Now API calls should work (Playwright request context keeps cookies)
    const res = await rpc(request, "videos/listVideos", {});
    expect(res.ok()).toBe(true);
  });

  test("auth check returns status", async ({ request }) => {
    const username = createUsername();
    // Before login
    const before = await rpc(request, "auth/check");
    expect((await json(before)).authenticated).toBe(false);

    // Register
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });

    // After register
    const after = await rpc(request, "auth/check");
    expect((await json(after)).authenticated).toBe(true);
  });

  test("login returns token in body", async ({ request }) => {
    const username = createUsername();
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });
    // Logout to clear cookie
    await rpc(request, "auth/logout");

    const res = await rpc(request, "auth/login", {
      username,
      password: "testpassword",
    });
    const body = await json(res);
    expect(body.token).toBeTruthy();
    expect(typeof body.token).toBe("string");
  });

  test("bearer token auth works for API calls", async ({ request }) => {
    const username = createUsername();
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });
    const loginRes = await rpc(request, "auth/login", {
      username,
      password: "testpassword",
    });
    const { token } = await json(loginRes);

    // Logout to clear cookie — force bearer-only path
    await rpc(request, "auth/logout");

    // Use bearer token directly
    const res = await request.post("/api/videos/listVideos", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: { json: {} },
    });
    expect(res.ok()).toBe(true);
  });

  test("bearer token auth check works", async ({ request }) => {
    const username = createUsername();
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });
    const loginRes = await rpc(request, "auth/login", {
      username,
      password: "testpassword",
    });
    const { token } = await json(loginRes);
    await rpc(request, "auth/logout");

    const res = await request.post("/api/auth/check", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: { json: {} },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.json.authenticated).toBe(true);
  });

  test("logout clears session", async ({ request }) => {
    const username = createUsername();
    await rpc(request, "auth/register", {
      username,
      password: "testpassword",
    });

    const logoutRes = await rpc(request, "auth/logout");
    expect(logoutRes.ok()).toBe(true);
    const setCookie = logoutRes.headers()["set-cookie"];
    expect(setCookie).toContain("Max-Age=0");
  });
});
