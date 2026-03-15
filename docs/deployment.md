# Deployment & Infrastructure

## Stack

- **Runtime**: Cloudflare Workers (entry: `src/server/index.ts`)
- **Database**: Cloudflare D1 (`zamak`, ID: `882ee273-02b6-4548-9c0f-087b320e4d8e`)
- **Assets**: SPA mode, worker-first for `/api/*`
- **Auth**: secrets as Cloudflare secrets (not in `wrangler.jsonc`)

## Deployment Procedure

### 1. Apply migrations to production D1

Migrations live in `src/server/migrations/`. Wrangler tracks which have been applied.

```sh
# Check which migrations are pending
pnpm wrangler d1 migrations list DB --remote

# Apply pending migrations
pnpm wrangler d1 migrations apply DB --remote
```

Always apply migrations **before** deploying the new worker code that depends on them.

### 2. Build and deploy

```sh
pnpm build
pnpm release
```

`pnpm release` runs `wrangler deploy`.

### 3. Verify

Check the app loads and the new feature works on the production URL.

## Adding a New Migration

1. Create `src/server/migrations/NNNN_description.sql` (next sequential number)
2. Update `src/server/schema.ts` to match the new schema
3. Test locally — `pnpm db:migrate` runs automatically during `pnpm dev`
4. Commit the migration + schema changes
5. At deploy time, run `pnpm wrangler d1 migrations apply DB --remote` before `pnpm release`

## Secrets Management

Secrets are set via `pnpm wrangler secret`:

```sh
# Set individual secret
echo "value" | pnpm wrangler secret put SECRET_NAME

# Or bulk from a key=value file
pnpm wrangler secret bulk .dev.vars.production
```

Current secrets:

- `AUTH_SECRET` — session signing key

The values in `.dev.vars` are dev-only defaults. Secrets override them in production.

## Initial Setup (one-time, already done)

See `docs/tasks/2026-03-04-deployment.md` for the original setup steps:

- Creating the D1 database
- Setting secrets
- First deploy
