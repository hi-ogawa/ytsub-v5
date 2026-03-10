# Auth Security Hardening

Follow-up to `2026-03-10-user-auth.md`. Findings from security review of the user auth system.

## Must fix before production

### 1. Replace SHA-256 with proper password hashing

**Severity: CRITICAL**

`src/server/auth.ts` uses plain SHA-256 — fast, unsalted, rainbow-table vulnerable.

**Fix:** Use bcrypt or argon2 with per-user salt and work factor. On Cloudflare Workers, `crypto.subtle.deriveBits` with PBKDF2 (100k+ iterations) is available natively. Alternatively, a pure-JS bcrypt/argon2 library.

**Files:** `src/server/auth.ts` (hashPassword, verifyPassword), migration to rehash existing passwords or force reset.

### 2. Add `secure: true` to session cookie

**Severity: HIGH**

`src/server/routes/auth.ts` sets `httpOnly` and `sameSite: "lax"` but omits `secure: true`. Cookie will be sent over plain HTTP, enabling session hijacking via MITM.

**Fix:** Add `secure: true` to all `setCookie` calls. Can gate on environment if local dev needs HTTP.

**Files:** `src/server/routes/auth.ts` (register, login cookie-setting blocks)

### 3. Rate limiting on auth endpoints

**Severity: HIGH**

Register and login have no throttling — enables brute force, account enumeration, spam registration. Turnstile captcha is deferred but doesn't replace server-side rate limiting.

**Fix:** Use Cloudflare rate limiting rules (easiest) or implement in-worker rate limiting with a KV/DO counter. Target: ~5 failed login attempts per IP per minute, ~3 registrations per IP per hour.

**Files:** `src/server/routes/auth.ts`, possibly `wrangler.jsonc` for Cloudflare config

### 4. Fix timing-based user enumeration

**Severity: MEDIUM-HIGH**

Login returns early when email not found (skips password hash computation), making non-existent accounts detectable via response time difference.

**Fix:** Always compute a dummy password hash when user is not found, so both code paths take similar time.

**Files:** `src/server/routes/auth.ts` (login handler)

## Should fix before production

### 5. Add max password length

**Severity: MEDIUM**

No upper bound on password length. Extremely long passwords could DoS the hashing step.

**Fix:** Add `z.string().max(256)` to password schema in register and login.

**Files:** `src/server/routes/auth.ts`

### 6. Add max length to text fields

**Severity: MEDIUM**

Bookmark fields (`text`, `translation`, `etymology`, `notes`) and other user-provided text fields have no `.max()` — unbounded strings can exhaust storage.

**Fix:** Add reasonable `.max()` limits to all user-provided text fields in zod schemas.

**Files:** `src/server/routes/bookmarks.ts`, `src/server/routes/videos.ts`

### 7. Session revocation

**Severity: MEDIUM**

30-day session TTL with no revocation mechanism. Compromised tokens stay valid until expiry.

**Fix:** Either shorten TTL (e.g. 7 days with refresh), or add a token version/epoch to the users table that invalidates all sessions when bumped. Full token blacklist is overkill for this scale.

**Files:** `src/server/auth.ts`, `src/server/schema.ts` (add tokenEpoch column)

## Status

- [x] 1. Proper password hashing (PBKDF2-SHA256, 100k iterations, 16-byte salt)
- [x] 2. Secure cookie flag
- [ ] 3. Rate limiting
- [x] 4. Timing-safe login
- [x] 5. Max password length
- [~] 6. Max payload/field lengths — deferred; Cloudflare enforces 100MB request body limit at platform level (free/pro plans)
- [ ] 7. Session revocation
