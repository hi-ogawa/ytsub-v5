# Security Audit

## Context

Security audit of ytsub-v5 covering authentication, API input validation, client-side rendering, infrastructure configuration, and secrets management.

## Findings

### Critical

#### 1. `.dev.vars` not in `.gitignore`

- **File:** `.gitignore`
- `.dev.vars.production` is excluded but `.dev.vars` is not
- Contains `AUTH_PASSWORD_HASH` and `AUTH_SECRET` (dev values)
- **Fix:** Add `.dev.vars` to `.gitignore`

#### 2. Session cookie missing `secure` flag

- **File:** `src/server/routes/auth.ts:20-24`
- Cookie has `httpOnly: true` and `sameSite: "lax"` but no `secure: true`
- Cookie could leak over plain HTTP in production
- **Fix:** Add `secure: true` to `setCookie` call

### High

#### 3. `sql.raw()` with user input (fragile SQL safety)

- **Files:** `src/server/routes/videos.ts:65-68,190-217`, `src/server/routes/bookmarks.ts:30-38`
- Numeric values pass through `sql.raw()` which bypasses parameterization
- Currently safe because Zod validates inputs as numbers
- If a schema ever changes to accept strings, this silently becomes an injection vector
- **Fix:** Add code comment documenting the invariant, or refactor batching to avoid `sql.raw()`

#### 4. No rate limiting on login

- **File:** `src/server/routes/auth.ts:13-26`
- No throttling on password attempts — brute-force possible
- **Fix:** Add Cloudflare Workers rate limiting or KV-based counter

#### 5. No pagination upper bound

- **Files:** `src/server/routes/videos.ts:94`, `src/server/routes/bookmarks.ts:56`
- `limit` param has no `.max()` — client can request `limit: 999999`
- **Fix:** Add `.min(1).max(100)` to limit schemas

### Medium

#### 6. Plain SHA-256 password hashing (no salt, no KDF)

- **File:** `src/server/auth.ts:41-49`
- Single SHA-256 with no salt — fast hash vulnerable to offline brute-force
- Constant-time comparison is correctly implemented
- Acceptable tradeoff for single-user on CF Workers (no native bcrypt/argon2)

#### 7. No Content Security Policy headers

- **File:** `src/server/index.ts`
- No CSP headers set; YouTube iframe embed would benefit from:
  ```
  default-src 'self'; frame-src https://www.youtube.com; script-src 'self' https://www.youtube.com; style-src 'self' 'unsafe-inline'
  ```

#### 8. No string length constraints on input schemas

- **Files:** `src/server/routes/videos.ts`, `src/server/routes/bookmarks.ts`
- String fields (`title`, `text`, `notes`, `translation`) accept arbitrarily long strings
- **Fix:** Add `.max()` to string schemas

#### 9. `status` field accepts any string

- **File:** `src/server/routes/bookmarks.ts:22`
- `status: z.string()` should be `z.enum(["pending", "approved", "rejected"])`

### Low

#### 10. Error messages may leak DB details

- **File:** `src/server/index.ts:11-16`
- Errors re-thrown as-is; DB constraint violations could expose table/column names
- **Fix:** Wrap DB errors with generic `ORPCError("INTERNAL_ERROR")`

#### 11. Bearer token = raw password

- **File:** `src/server/auth.ts:17-24`
- API clients send actual password as Bearer token
- Acceptable for single-user; per-client API keys would be more robust

#### 12. No session revocation on logout

- Stateless HMAC tokens mean logout only deletes the client cookie
- Token remains valid until expiry — design tradeoff of stateless sessions

### No Issues Found

- **XSS:** No `dangerouslySetInnerHTML` or `innerHTML`; React escaping handles all content
- **CORS:** No cross-origin headers; default deny correct for same-origin SPA
- **CSRF:** `sameSite: "lax"` on cookies provides protection
- **Mass assignment:** All handlers explicitly whitelist fields
- **Auth middleware coverage:** All data routes use `authed` base; only `auth/login`, `auth/logout`, `auth/check` are public
- **Timing attacks:** Password comparison uses constant-time XOR
- **Referential integrity:** Proper foreign keys with CASCADE/SET NULL
- **E2E test coverage:** Auth flows well-tested
- **localStorage:** Only stores non-sensitive preference (`ytsub:auto-scroll`)
- **Dependencies:** All current, reputable packages; no known vulnerabilities

## Suggested Fixes

Quick wins (< 5 min each):

| #   | Fix                                      | File                                          |
| --- | ---------------------------------------- | --------------------------------------------- |
| 1   | Add `.dev.vars` to `.gitignore`          | `.gitignore`                                  |
| 2   | Add `secure: true` to session cookie     | `src/server/routes/auth.ts`                   |
| 5   | Add `.min(1).max(100)` to `limit` params | `src/server/routes/videos.ts`, `bookmarks.ts` |
| 9   | Change `status` to `z.enum([...])`       | `src/server/routes/bookmarks.ts`              |

## Status

- [x] Audit complete
- [x] Quick fixes applied (#2 secure cookie, #5 pagination bounds, #8 string lengths, #9 status enum)
- [ ] Fix #1: Add `.dev.vars` to `.gitignore`
- [ ] Rate limiting implemented
- [ ] CSP headers added
