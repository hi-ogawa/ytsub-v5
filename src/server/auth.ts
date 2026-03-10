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

export { hashPassword, verifyPassword } from "../lib/password.ts";

export async function createSessionToken(
  userId: number,
  expiresInDays = 30,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  return sign(`${userId}:${exp}`, env.AUTH_SECRET);
}
