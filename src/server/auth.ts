import { env } from "cloudflare:workers";

function hexEncode(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return hexEncode(buf);
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return hexEncode(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

export async function verifyPassword(input: string): Promise<boolean> {
  const hash = await sha256Hex(input);
  return timingSafeEqual(hash, env.AUTH_PASSWORD_HASH);
}

/** Create a signed token: `{exp}.{hmac_signature}` */
export async function signToken(expiresInDays = 30): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  const sig = await hmacSign(env.AUTH_SECRET, String(exp));
  return `${exp}.${sig}`;
}

/** Verify a token's signature and expiry. Returns true if valid. */
export async function verifyToken(token: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (Number(exp) < Date.now() / 1000) return false;
  const expected = await hmacSign(env.AUTH_SECRET, exp);
  return timingSafeEqual(sig, expected);
}

export function parseAuthToken(request: Request): string | null {
  // Try Authorization: Bearer header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // Fall back to session cookie
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

export function sessionCookie(token: string, maxAgeDays = 30): string {
  return `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeDays * 86400}`;
}

export function clearSessionCookie(): string {
  return "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}
