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

/** Extract token from cookie or Authorization header */
function getToken(headers: Headers): string | undefined {
  const cookie = getCookie(headers, "session");
  if (cookie) return cookie;
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
}

/** Verify a signed session token, returning userId if valid */
export async function verifySessionToken(
  token: string,
): Promise<number | undefined> {
  const payload = await unsign(token, env.AUTH_SECRET);
  if (!payload) return;
  const [userIdStr, expStr] = payload.split(":");
  const userId = Number(userIdStr);
  const exp = Number(expStr);
  if (userId && exp >= Date.now() / 1000) return userId;
}

/** Auth middleware — verifies session cookie or bearer token, extracts userId */
const requireAuth = pub.middleware(async ({ context, next }) => {
  if (context.reqHeaders) {
    const token = getToken(context.reqHeaders);
    if (token) {
      const userId = await verifySessionToken(token);
      if (userId) return next({ context: { userId } });
    }
  }

  throw new ORPCError("UNAUTHORIZED");
});

/** Protected base — requires valid session, provides userId in context */
export const authed = pub.use(requireAuth);

export { hashPassword, verifyPassword } from "../lib/password.ts";

export async function createSessionToken(
  userId: number,
  expiresInDays = 30,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  return sign(`${userId}:${exp}`, env.AUTH_SECRET);
}
