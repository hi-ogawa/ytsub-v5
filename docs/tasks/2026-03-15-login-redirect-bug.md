# Login redirect bug

## Problem

After deploying, login flow behaves incorrectly:

1. Submit login form
2. Login form re-appears (flicker)
3. Manual browser reload
4. Now authenticated

## Root cause investigation

### How login works

1. `LoginPage` submits via TanStack Query mutation → `POST /api/auth/login`
2. Server responds with `Set-Cookie: session=...` (httpOnly, secure, sameSite=lax)
3. `onSuccess` callback fires

**Before fix:** `onSuccess` called `navigate("/", { replace: true })` (React Router client-side navigation)
**After fix:** `onSuccess` sets `window.location.href = "/"` (full page reload)

### What navigate("/") triggers

React Router matches `/` → root layout (`authLoader`) → `AuthLayout` → `VideoListPage`.
`authLoader` does `fetch("/api/auth/check")` to determine `authenticated` boolean.
If `authenticated: false`, `AuthLayout` redirects to `/login`.

### What we know

- **E2E test passes on main with the old `navigate()` code** — the bug is not reliably reproducible locally
- Cookie config is clean: `secure: true`, `sameSite: "lax"`, `httpOnly: true`, `path: "/"` (default)
- No environment-specific cookie differences between dev and prod
- Server is Cloudflare Workers with D1

### What we don't know

The exact production-only cause. Candidates:

1. **Loader not revalidating** — React Router might not re-run `authLoader` on `navigate("/")` under certain conditions (both `/login` and `/` share the root layout). Works locally but might differ with production build/routing.
2. **Cookie not sent** — the `Set-Cookie` from login response might not be available for the immediately-following `authLoader` fetch in production (network latency, Cloudflare edge behavior).
3. **Cached auth/check response** — Cloudflare or browser caching the `POST /api/auth/check` response.

### How to confirm (DevTools on prod)

Revert the fix and deploy, or test on current prod if it still has old code.

1. Open DevTools → Network tab, enable **Preserve log**
2. Submit login form
3. Check these requests in order:

| #   | Request                | What to check                                                                                                              |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /api/auth/login` | Response headers: does `Set-Cookie: session=...` appear?                                                                   |
| 2   | `POST /api/auth/check` | Does this request exist at all? If yes: does `Cookie: session=...` appear in request headers? What does response body say? |
| 3   | Any navigation         | Is there a redirect back to `/login`?                                                                                      |

- If request 2 is missing → React Router didn't revalidate the loader
- If request 2 exists but cookie is missing → browser didn't propagate the cookie in time
- If request 2 has cookie but returns `authenticated: false` → server-side token verification issue

## Fix

Changed `navigate("/", { replace: true })` → `window.location.href = "/"` in both `LoginPage` and `RegisterPage`. This forces a full page reload, which guarantees `authLoader` runs fresh with the cookie. Matches the existing pattern used by logout (`window.location.href = "/login"`).

Files changed:

- `src/routes/login.tsx` — use `window.location.href` instead of `navigate()`
- `e2e/basic.spec.ts` — added regression assertion (login form not visible after login)

## Status

- **Done:** Fix applied, e2e assertion added
- **Remaining:** Root cause unconfirmed — debug on prod using DevTools steps above if curious
