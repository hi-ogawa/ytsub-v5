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

### Root cause (confirmed)

**React Router's `defaultShouldRevalidate` is `false` by default.** It only becomes `true` when specific conditions are met (same URL, search params changed, or new route instance). None apply here:

From `node_modules/react-router/dist/development/chunk-XOLAXE2Z.js` (line ~4064):

```js
let defaultShouldRevalidate = false;  // starts FALSE
if (typeof callSiteDefaultShouldRevalidate === "boolean") { ... }
else if (shouldSkipRevalidation) { ... }
else if (isRevalidationRequired) { defaultShouldRevalidate = true; }
else if (currentUrl.pathname + currentUrl.search === nextUrl.pathname + nextUrl.search) { defaultShouldRevalidate = true; }
else if (currentUrl.search !== nextUrl.search) { defaultShouldRevalidate = true; }
else if (isNewRouteInstance(state.matches[index], match)) { defaultShouldRevalidate = true; }
```

For `/login` → `/`:

- `isRevalidationRequired` — false (only set after action redirects with `X-Remix-Revalidate`)
- Same URL — no (`/login` !== `/`)
- Search params changed — no
- `isNewRouteInstance` — **false for the root route** (same route ID "root", same params) — only child routes change (GuestLayout → AuthLayout)

So `authLoader` on the root route is **not re-run** on `navigate("/")`. The stale `authenticated: false` persists.

**Why e2e passes on main:** Vite dev server HMR likely triggers extra re-renders/revalidation that masks the issue. Confirmed via DevTools: no `auth/check` request after login on prod, but present on dev.

## Fix

Changed `navigate("/", { replace: true })` → `window.location.href = "/"` in both `LoginPage` and `RegisterPage`. This forces a full page reload, which guarantees `authLoader` runs fresh with the cookie. Matches the existing pattern used by logout (`window.location.href = "/login"`).

Files changed:

- `src/routes/login.tsx` — use `window.location.href` instead of `navigate()`
- `e2e/basic.spec.ts` — added regression assertion (login form not visible after login)

## Status

- **Done:** Fix applied, e2e assertion added, root cause confirmed
- Root cause: React Router `defaultShouldRevalidate` is `false` — root loader skipped because root route instance unchanged (`/login` → `/` only swaps child routes)
