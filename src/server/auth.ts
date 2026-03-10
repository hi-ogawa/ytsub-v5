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

/** Auth middleware — verifies session cookie, extracts userId */
const requireAuth = pub.middleware(async ({ context, next }) => {
  const cookie = getCookie(context.reqHeaders, "session");
  if (cookie) {
    const payload = await unsign(cookie, env.AUTH_SECRET);
    if (payload) {
      const [userIdStr, expStr] = payload.split(":");
      const userId = Number(userIdStr);
      const exp = Number(expStr);
      if (userId && exp >= Date.now() / 1000) {
        return next({ context: { userId } });
      }
    }
  }

  throw new ORPCError("UNAUTHORIZED");
});

/** Protected base — requires valid session, provides userId in context */
export const authed = pub.use(requireAuth);

// --- helpers ---

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string): Promise<string> {
  return sha256Hex(password);
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const hash = await sha256Hex(password);
  if (hash.length !== storedHash.length) return false;
  const a = new TextEncoder().encode(hash);
  const b = new TextEncoder().encode(storedHash);
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}

export async function createSessionToken(
  userId: number,
  expiresInDays = 30,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  return sign(`${userId}:${exp}`, env.AUTH_SECRET);
}
