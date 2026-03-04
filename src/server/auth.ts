import { ORPCError, os } from "@orpc/server";
import { getCookie, sign, unsign } from "@orpc/server/helpers";
import type {
  RequestHeadersPluginContext,
  ResponseHeadersPluginContext,
} from "@orpc/server/plugins";
import { env } from "cloudflare:workers";

interface AuthContext
  extends RequestHeadersPluginContext, ResponseHeadersPluginContext {}

/** Public base — has request/response headers from plugins but no auth check */
export const pub = os.$context<AuthContext>();

/** Auth middleware — verifies Bearer password or session cookie */
const requireAuth = pub.middleware(async ({ context, next }) => {
  // Bearer token = raw password
  const bearer = context.reqHeaders
    ?.get("Authorization")
    ?.replace("Bearer ", "");
  if (bearer) {
    if (await verifyPassword(bearer)) return next({});
    throw new ORPCError("UNAUTHORIZED");
  }

  // Session cookie = signed HMAC token
  const cookie = getCookie(context.reqHeaders, "session");
  if (cookie) {
    const exp = await unsign(cookie, env.AUTH_SECRET);
    if (exp && Number(exp) >= Date.now() / 1000) return next({});
  }

  throw new ORPCError("UNAUTHORIZED");
});

/** Protected base — requires valid session */
export const authed = pub.use(requireAuth);

// --- helpers used by auth routes ---

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(input: string): Promise<boolean> {
  const hash = await sha256Hex(input);
  // Constant-length comparison (both are 64-char hex)
  if (hash.length !== env.AUTH_PASSWORD_HASH.length) return false;
  const a = new TextEncoder().encode(hash);
  const b = new TextEncoder().encode(env.AUTH_PASSWORD_HASH);
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}

export async function createSessionToken(expiresInDays = 30): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  return sign(String(exp), env.AUTH_SECRET);
}
