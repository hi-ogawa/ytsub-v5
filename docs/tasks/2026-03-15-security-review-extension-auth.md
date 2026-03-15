# Security Review: Extension-Side Login

Follow-up to [`2026-03-10-auth-security-hardening.md`](./2026-03-10-auth-security-hardening.md). That review covered server auth fundamentals (password hashing, cookie flags, timing attacks, etc.). This review focuses on **new surface area introduced by extension-side login** — token storage in the extension, the bearer token flow, and CORS.

## Scope

Extension login flow: `bookmarks.tsx` → `orpc.auth.login` → token stored in `chrome.storage.local` → injected as `Authorization: Bearer` on all API calls.

## Already covered (no change needed)

These were addressed in the previous hardening round:

- Password hashing (PBKDF2-SHA256 ✅)
- Secure cookie flag ✅
- Timing-safe login ✅
- Max password length ✅
- Rate limiting (still open — unchanged)
- Session revocation (still open — unchanged)

## Extension-specific findings

### 1. CORS `origin: "*"` — restrict to known origins

`src/server/index.ts:13` allows all origins. Before the extension, only the web app (same-origin) made API calls, so this was harmless. Now the extension sends bearer tokens cross-origin from `chrome-extension://<id>` — widening the surface.

Any website can call the API and receive responses. Bearer auth prevents CSRF, but an attacker who somehow obtains a token (e.g. via XSS in another extension) can use it from any origin.

**Recommendation**: Restrict to known origins:

```ts
new CORSPlugin({
  origin: [
    /^chrome-extension:\/\//,
    "https://zamak.pages.dev",
    ...(isDev ? ["http://localhost:5173"] : []),
  ],
});
```

**Severity**: Low (defense-in-depth)

### 2. Dummy password hash bypasses PBKDF2

The timing-safe login fix from the previous review (`routes/auth.ts:70`) uses `"$dummy$"` as the fallback hash. But `verifyPassword` returns `false` at the `sep === -1` check (`password.ts:58`) without running PBKDF2, partially defeating the timing mitigation.

**Fix**: Use a properly formatted dummy so PBKDF2 actually runs:

```ts
const DUMMY_HASH = "00".repeat(16) + ":" + "00".repeat(32);
// ...
user?.passwordHash ?? DUMMY_HASH;
```

**Severity**: Low (timing difference is small and hard to exploit remotely, but easy to fix)

### 3. Extension token storage — acceptable

`chrome.storage.local` stores the bearer token in plaintext. This is standard for extensions — Chrome encrypts the storage at the OS level, and encrypting in JS would just be obfuscation (the key would be in extension code). No action needed.

## Summary

| #   | Action                | Severity | Effort |
| --- | --------------------- | -------- | ------ |
| 1   | Restrict CORS origins | Low      | Small  |
| 2   | Fix dummy hash format | Low      | Tiny   |

Previous open items (rate limiting #3, session revocation #7) remain unchanged.

## Status

- [x] Review complete
- [ ] Fixes applied
