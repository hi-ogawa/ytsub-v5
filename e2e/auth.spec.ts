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

const json = async (response: any) => {
  const body = await response.json();
  return body.json;
};

test.describe("auth endpoints", () => {
  test("unauthenticated API calls return 401", async ({ request }) => {
    const response = await rpc(request, "videos/listVideos", {});
    expect(response.status()).toBe(401);
  });

  test("register creates user and sets session cookie", async ({ request }) => {
    const response = await rpc(request, "auth/register", {
      username: "newuser",
      password: "testpassword",
    });
    expect(response.ok()).toBe(true);
    const body = await json(response);
    expect(body.ok).toBe(true);
    const setCookie = response.headers()["set-cookie"];
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("register duplicate username returns conflict", async ({ request }) => {
    // Register first
    await rpc(request, "auth/register", {
      username: "dupuser",
      password: "testpassword",
    });
    // Try again
    const response = await rpc(request, "auth/register", {
      username: "dupuser",
      password: "testpassword",
    });
    expect(response.status()).toBe(409);
  });

  test("login with wrong password returns 401", async ({ request }) => {
    // Register first
    await rpc(request, "auth/register", {
      username: "wrongpw",
      password: "testpassword",
    });
    const response = await rpc(request, "auth/login", {
      username: "wrongpw",
      password: "badpassword",
    });
    expect(response.status()).toBe(401);
  });

  test("login with correct password sets session cookie", async ({
    request,
  }) => {
    // Register first
    await rpc(request, "auth/register", {
      username: "loginuser",
      password: "testpassword",
    });
    const response = await rpc(request, "auth/login", {
      username: "loginuser",
      password: "testpassword",
    });
    expect(response.ok()).toBe(true);
    const setCookie = response.headers()["set-cookie"];
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("authenticated API calls succeed with cookie", async ({ request }) => {
    await rpc(request, "auth/register", {
      username: "autheduser",
      password: "testpassword",
    });

    // Now API calls should work (Playwright request context keeps cookies)
    const response = await rpc(request, "videos/listVideos", {});
    expect(response.ok()).toBe(true);
  });

  test("auth check returns status", async ({ request }) => {
    // Before login
    const before = await rpc(request, "auth/check");
    expect((await json(before)).authenticated).toBe(false);

    // Register
    await rpc(request, "auth/register", {
      username: "checkuser",
      password: "testpassword",
    });

    // After register
    const after = await rpc(request, "auth/check");
    expect((await json(after)).authenticated).toBe(true);
  });

  test("login returns token in body", async ({ request }) => {
    await rpc(request, "auth/register", {
      username: "tokenuser",
      password: "testpassword",
    });
    // Logout to clear cookie
    await rpc(request, "auth/logout");

    const response = await rpc(request, "auth/login", {
      username: "tokenuser",
      password: "testpassword",
    });
    const body = await json(response);
    expect(body.token).toBeTruthy();
    expect(typeof body.token).toBe("string");
  });

  test("bearer token auth works for API calls", async ({ request }) => {
    await rpc(request, "auth/register", {
      username: "beareruser",
      password: "testpassword",
    });
    const loginResponse = await rpc(request, "auth/login", {
      username: "beareruser",
      password: "testpassword",
    });
    const { token } = await json(loginResponse);

    // Logout to clear cookie — force bearer-only path
    await rpc(request, "auth/logout");

    // Use bearer token directly
    const response = await request.post("/api/videos/listVideos", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: { json: {} },
    });
    expect(response.ok()).toBe(true);
  });

  test("bearer token auth check works", async ({ request }) => {
    await rpc(request, "auth/register", {
      username: "bearercheck",
      password: "testpassword",
    });
    const loginResponse = await rpc(request, "auth/login", {
      username: "bearercheck",
      password: "testpassword",
    });
    const { token } = await json(loginResponse);
    await rpc(request, "auth/logout");

    const response = await request.post("/api/auth/check", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: { json: {} },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.json.authenticated).toBe(true);
  });

  test("logout clears session", async ({ request }) => {
    await rpc(request, "auth/register", {
      username: "logoutuser",
      password: "testpassword",
    });

    const logoutResponse = await rpc(request, "auth/logout");
    expect(logoutResponse.ok()).toBe(true);
    const setCookie = logoutResponse.headers()["set-cookie"];
    expect(setCookie).toContain("Max-Age=0");
  });
});
