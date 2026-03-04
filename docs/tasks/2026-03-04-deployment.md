# Deployment Setup

## Context

ytsub-v5 is a Cloudflare Workers + D1 app. `wrangler deploy` is already wired up as `pnpm release`. CI exists for build + e2e but doesn't deploy. The goal is to set up production deployment.

## What exists

- **Runtime**: Cloudflare Workers (entry: `src/server/index.ts`)
- **Database**: D1 (`ytsub-v5`, `database_id: "local"` — needs real ID for prod)
- **Assets**: SPA mode with worker-first for `/api/*`
- **Auth**: Password hash + secret in `wrangler.jsonc` `vars` (dev only)
- **CI**: GitHub Actions — `build` (lint, tsc, build) + `e2e` (Playwright) on push/PR
- **Deploy script**: `pnpm release` → `wrangler deploy`

## Steps

### 1. Create production D1 database

```sh
wrangler d1 create ytsub-v5
```

Update `wrangler.jsonc` with the real `database_id` returned. Keep `"local"` working for dev — wrangler uses the real ID only on deploy.

### 2. Run migrations on production D1

```sh
wrangler d1 migrations apply DB --remote
```

This applies `0001_init.sql` and `0002_captions_text1_text2.sql` to the remote database.

### 3. Set production secrets

```sh
# Generate a random secret for session signing
openssl rand -hex 32 | wrangler secret put AUTH_SECRET

# Hash your password and set it
echo -n "your-password" | openssl dgst -sha256 -hex | wrangler secret put AUTH_PASSWORD_HASH

# Or create .dev.vars.production (or any key value pair file) and run
pnpm wrangler secret bulk .dev.vars.production
```

The `vars` in `wrangler.jsonc` are dev-only defaults. Secrets override vars in production.
Make sure it's saved as "secret" and not "plain text".

### 4. Deploy manually first

```sh
pnpm build && pnpm release
```

Verify the app loads, auth works, and API responds.

### 5. Add CD to GitHub Actions (optional)

Add a deploy job to `.github/workflows/ci.yml` that runs on `main` push after build + e2e pass:

```yaml
deploy:
  needs: [build, e2e]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: corepack enable
    - run: pnpm i
    - run: pnpm build
    - run: pnpm release
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Requires adding `CLOUDFLARE_API_TOKEN` to GitHub repo secrets.

### 6. Custom domain (optional)

Configure in Cloudflare dashboard or via `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "ytsub.example.com", "custom_domain": true }]
```

## Open questions

- Do you want CD (auto-deploy on main push), or manual `pnpm release` is fine?
- Custom domain needed, or `*.workers.dev` is fine for now?
- Any other environment variables or configuration needed?

## Status

- **Planning** — awaiting feedback
