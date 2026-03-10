// PBKDF2-SHA256 password hashing — no platform-specific imports, runs in Node and Workers

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

/** Returns "salt:hash" in hex. Optionally accepts a fixed salt (for deterministic output in seeds). */
export async function hashPassword(
  password: string,
  fixedSalt?: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const salt =
    fixedSalt ??
    (crypto.getRandomValues(
      new Uint8Array(SALT_BYTES),
    ) as Uint8Array<ArrayBuffer>);
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
