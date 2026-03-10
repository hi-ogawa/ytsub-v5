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

// --- password hashing (PBKDF2-SHA256, 100k iterations) ---

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    HASH_BYTES * 8,
  );
}

/** Returns "salt:hash" in hex */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(
    new Uint8Array(SALT_BYTES),
  ) as Uint8Array<ArrayBuffer>;
  const hash = await pbkdf2(password, salt);
  return `${toHex(salt.buffer)}:${toHex(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const sep = stored.indexOf(":");
  if (sep === -1) return false;
  const salt = fromHex(stored.slice(0, sep)) as Uint8Array<ArrayBuffer>;
  const expectedHash = fromHex(stored.slice(sep + 1));
  const actualHash = new Uint8Array<ArrayBuffer>(await pbkdf2(password, salt));
  if (expectedHash.length !== actualHash.length) return false;
  let result = 0;
  for (let i = 0; i < expectedHash.length; i++)
    result |= expectedHash[i] ^ actualHash[i];
  return result === 0;
}

export async function createSessionToken(
  userId: number,
  expiresInDays = 30,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  return sign(`${userId}:${exp}`, env.AUTH_SECRET);
}
