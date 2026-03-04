import {
  clearSessionCookie,
  parseAuthToken,
  sessionCookie,
  signToken,
  verifyPassword,
  verifyToken,
} from "../auth.ts";

/** Handle POST /api/auth/login */
export async function handleLogin(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const body = (await request.json()) as { password?: string };
  if (!body.password) {
    return Response.json({ error: "Password required" }, { status: 400 });
  }
  const valid = await verifyPassword(body.password);
  if (!valid) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }
  const token = await signToken();
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookie(token) } },
  );
}

/** Handle POST /api/auth/logout */
export async function handleLogout(): Promise<Response> {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie() } },
  );
}

/** Handle GET /api/auth/check */
export async function handleAuthCheck(request: Request): Promise<Response> {
  const token = parseAuthToken(request);
  if (!token) {
    return Response.json({ authenticated: false });
  }
  const valid = await verifyToken(token);
  return Response.json({ authenticated: valid });
}
