# Authentication (single-user)

## Problem

All API endpoints (`/api/*`) are currently open — anyone who discovers the URL can read, create, and delete videos/bookmarks. Since this is a single-user app, we need a simple auth layer that protects the API (and optionally the frontend) without the complexity of a full user management system.

## Current State

- **Server:** oRPC router in `src/server/rpc.ts`, served via Cloudflare Workers (`src/server/index.ts`). No middleware layer.
- **Client:** `src/rpc.ts` creates an `RPCLink` to `/api` — no auth headers sent.
- **Infra:** Cloudflare Workers + D1. No secrets/env vars configured in `wrangler.jsonc`.
- **Crypto:** Web Crypto API available in Workers runtime (no npm package needed for hashing/HMAC).

## Alternatives

Three approaches evaluated below. Each is a self-contained plan.

---

## Option A: Password login + stateless HMAC cookie ← chosen

**Summary:** User enters a password on a login page. Server validates against a hardcoded hash, issues an HttpOnly cookie containing an HMAC-signed token. Stateless — no sessions table, no DB changes. Server verifies the cookie by re-computing the HMAC.

**Design:**

- Password hash stored as Cloudflare secret (`AUTH_PASSWORD_HASH`)
- On login: verify password → sign `{ exp }` with `AUTH_SECRET` via HMAC-SHA256 → set as HttpOnly cookie
- On request: parse cookie → verify HMAC signature → check expiry → allow/deny
- External API clients (agent/CLI) can use `Authorization: Bearer <token>` with the same HMAC token
- No DB changes, no sessions table, no cleanup

**Scope:** Protect `/api/*` routes only (except `health` and `auth.login`). SPA loads freely. Focus on server-side logic first; UI integration later.

### Implementation plan

**Files to create:**

- `src/server/auth.ts` — password verification, HMAC token sign/verify
- `src/server/routes/auth.ts` — login/logout/check RPC endpoints
- `src/components/login.tsx` — login form component (minimal, not integrated into app yet)

**Files to modify:**

- `src/server/rpc.ts` — add `auth` router, add auth middleware to protected routers
- `src/server/index.ts` — parse cookie/bearer from request, pass to oRPC context
- `wrangler.jsonc` — add `AUTH_PASSWORD_HASH` and `AUTH_SECRET` vars (dev)

**Steps:**

1. **Add secrets to `wrangler.jsonc` (dev vars)**
   - `AUTH_PASSWORD_HASH` — SHA-256 hex of the password
   - `AUTH_SECRET` — random hex string for HMAC signing
   - Production: use `wrangler secret put` instead

2. **Auth helpers (`src/server/auth.ts`)**
   - `verifyPassword(input, hash)` — SHA-256 the input, timing-safe compare with stored hash
   - `signToken(secret, expiresInDays)` — create `exp` timestamp, HMAC-SHA256 sign `exp` with secret, return `${exp}.${signature}`
   - `verifyToken(secret, token)` — split token, re-sign `exp`, compare signatures, check not expired

3. **Auth routes (`src/server/routes/auth.ts`)**
   - `auth.login` — accepts `{ password }`, verifies, signs token, returns with `Set-Cookie` header
   - `auth.logout` — clears cookie
   - `auth.check` — returns `{ authenticated: true/false }`

4. **Auth middleware in `src/server/index.ts`**
   - Parse `Cookie: session=<token>` or `Authorization: Bearer <token>` from request
   - Pass token into oRPC context
   - oRPC middleware: verify token, reject 401 if invalid
   - Exempt: `health`, `auth.login`, `auth.check`

5. **Login component (`src/components/login.tsx`)**
   - Simple password input + submit
   - Calls `auth.login`, not yet wired into app routing

---

## Option B: Static API key (Bearer token)

**Summary:** A single static API key stored as a Cloudflare secret. All requests must include `Authorization: Bearer <key>`. No login page, no sessions.

**Pros:**

- Simplest implementation — no DB changes, no session management, no login UI
- Works identically for browser and API clients
- Stateless — no session table to manage/clean up

**Cons:**

- Key must be stored client-side (localStorage or hardcoded) — visible in DevTools
- No login/logout flow — if key is compromised, must rotate and update all clients
- Less secure for browser use (not HttpOnly, vulnerable to XSS extraction)
- Need some mechanism to get the key into the browser (prompt? env var baked into build?)

**Scope:** Protect `/api/*` routes only.

### Implementation plan

**Files to create:**

- `src/server/auth.ts` — key validation helper

**Files to modify:**

- `src/server/index.ts` — check `Authorization` header before routing to oRPC
- `wrangler.jsonc` — add `API_KEY` secret
- `src/rpc.ts` — add `Authorization` header to RPCLink fetch

**Steps:**

1. **Add `API_KEY` secret**
   - Generate: `openssl rand -hex 32`
   - Store via `wrangler secret put API_KEY` (prod), `vars` in wrangler.jsonc (dev)

2. **Server middleware in `src/server/index.ts`**

   ```
   - Parse `Authorization: Bearer <token>` from request
   - Compare with `env.API_KEY` using timing-safe comparison
   - Return 401 if missing/invalid
   - Exempt `health` endpoint
   ```

3. **Client header in `src/rpc.ts`**

   ```
   - RPCLink custom fetch: read key from localStorage
   - Attach as `Authorization: Bearer <key>` header
   - User manually sets key once via browser console or a simple prompt
   ```

4. **Key entry (minimal UI)**
   - On first load, if no key in localStorage, prompt user
   - Or: skip UI entirely, user sets `localStorage.setItem('api-key', '...')` in console

---

## Option C: Cloudflare Access (zero-trust)

**Summary:** Use Cloudflare Access to place the entire app behind an identity-aware proxy. Cloudflare handles auth before the request reaches the Worker.

**Pros:**

- Zero application code changes for basic protection
- Enterprise-grade security (MFA, SSO, device posture)
- Protects both frontend and API with no code
- Audit logs out of the box

**Cons:**

- Requires Cloudflare Zero Trust plan (free tier allows up to 50 users, but adds operational complexity)
- Ties auth to Cloudflare infrastructure — not portable
- External API clients (agent/CLI) need service tokens configured in Cloudflare dashboard
- Overkill for a personal single-user app
- No local dev protection — only works in deployed environment
- JWT validation needed if you want to programmatically check identity in the Worker

**Scope:** Protects everything (frontend + API) at the network level.

### Implementation plan

**Files to create:** None (or optionally `src/server/cf-access.ts` for JWT validation)

**Files to modify:** None in application code

**Steps:**

1. **Configure Cloudflare Access**
   - Go to Cloudflare Zero Trust dashboard
   - Create an Access Application for the ytsub domain
   - Set policy: allow your email (e.g. via one-time PIN or GitHub OAuth)

2. **Service tokens for API clients**
   - Create a Service Token in the dashboard
   - API clients include `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers
   - Agent/CLI scripts need these headers added

3. **Optional: JWT validation in Worker**
   - Cloudflare Access adds a `CF-Authorization` header with a signed JWT
   - Validate JWT in `src/server/index.ts` to extract user identity
   - Only needed if you want to log who made requests (not needed for single-user)

---

## Comparison Matrix

| Criteria                | A: Password + Cookie | B: Static API Key | C: Cloudflare Access |
| ----------------------- | -------------------- | ----------------- | -------------------- |
| Implementation effort   | Medium               | Low               | Low (config only)    |
| Security (browser)      | High (HttpOnly)      | Low (XSS risk)    | High                 |
| Security (API)          | High                 | Medium            | High                 |
| Login UX                | Password form        | Manual/console    | Cloudflare login     |
| External client support | Bearer token         | Bearer token      | Service token        |
| Local dev works         | Yes                  | Yes               | No                   |
| Portability             | High                 | High              | Low (CF-only)        |
| DB changes needed       | Yes (sessions)       | No                | No                   |
| Session management      | Yes (expiry/cleanup) | No                | No                   |

## Status

- **Decision:** Option A (stateless HMAC cookie), server-side first
- **Done:**
  - `wrangler.jsonc` — dev vars for `AUTH_PASSWORD_HASH` (sha256 of "dev") and `AUTH_SECRET`
  - `worker-configuration.d.ts` — added Env types for auth vars
  - `src/server/auth.ts` — verifyPassword, signToken, verifyToken, parseAuthToken, cookie helpers
  - `src/server/routes/auth.ts` — plain REST handlers for login/logout/check (need Set-Cookie headers, can't use oRPC)
  - `src/server/index.ts` — auth gate: auth endpoints dispatched first, then token check before oRPC (health exempt)
  - `src/components/login.tsx` — standalone login form (not wired into app)
  - `knip.json` — added login.tsx as entry point
- **Remaining:**
  - Wire login component into app (redirect on 401)
  - E2E tests for auth flow
  - Production secrets (`wrangler secret put AUTH_PASSWORD_HASH` / `AUTH_SECRET`)
- **Deferred:** App integration (login redirect on 401, routing guard)
