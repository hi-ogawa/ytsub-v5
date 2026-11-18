# Deployment & Infrastructure

## Stack

- **Runtime**: Cloudflare Workers (entry: `src/server/index.ts`)
- **Database**: Cloudflare D1 (`zamak` for production, `zamak-staging` for Previews)
- **Assets**: SPA mode, worker-first for `/api/*`
- **Auth**: secrets as Cloudflare secrets (not in `wrangler.jsonc`)
- **CI/CD**: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), connected to this repo

## Deploys and Previews

Workers Builds builds every push with `pnpm build`, then runs one of two commands:

| Branch         | Command                | What it does                                                                                                                                       |
| -------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`         | `pnpm release`         | Applies pending migrations to `zamak`, then deploys to production                                                                                  |
| Other branches | `pnpm release-preview` | Applies pending migrations to `zamak-staging`, then creates or updates the branch's [Preview](https://developers.cloudflare.com/workers/previews/) |

A PR gets a comment with its Preview URL. Check the build log in the Cloudflare dashboard when a deploy or Preview fails.

Migrations run before the new code goes live, so code can rely on the schema of its own commit. If the deploy step fails after migrating, production runs the old code on the new schema until the next deploy, which is harmless as long as migrations only add tables and columns.

Previews don't inherit production bindings or secrets. The `previews` block in `wrangler.jsonc` binds `DB` to `zamak-staging`, and `wrangler.preview-migrations.jsonc` exists only so `wrangler d1 migrations apply` can reach that database. All Previews share it, so two open PRs with different new migrations conflict. When a closed PR leaves a migration behind that conflicts with a later one, delete and recreate `zamak-staging` (see [Initial Setup](#initial-setup)).

To try the extension against a Preview, set its server URL in the Advanced dialog to the Preview URL. Previews use the staging database, so register a separate account there.

## Deploying Manually

Run the same command from a machine logged in with `pnpm wrangler login`:

```sh
pnpm build
pnpm release
```

## Extension Compatibility

The extension on the Chrome Web Store is version 0.2.0. It predates server sync and makes no server calls, so a deploy only needs to work with extension builds made from the repo.

This changes once a version with sign-in is published. From then on, every deploy must keep the API compatible with the published extension, because users get extension updates only after store review, while the server changes on every deploy.

## Adding a New Migration

1. Create `src/server/migrations/NNNN_description.sql` (next sequential number)
2. Update `src/server/schema.ts` to match the new schema
3. Test locally — `pnpm db:migrate` runs automatically during `pnpm dev`
4. Commit the migration + schema changes. The PR's Preview applies it to `zamak-staging`, and the merge applies it to `zamak`

To see what is pending on production:

```sh
pnpm wrangler d1 migrations list DB --remote
```

## Secrets Management

Production secrets are set via `pnpm wrangler secret`:

```sh
# Set individual secret
echo "value" | pnpm wrangler secret put SECRET_NAME

# Or bulk from a key=value file
pnpm wrangler secret bulk .dev.vars.production
```

Previews read secrets from the Preview base config instead:

```sh
pnpm wrangler preview base-config secret put SECRET_NAME
```

Current secrets, needed in both places:

- `AUTH_SECRET` — session signing key. Use a different value for Previews

The values in `.dev.vars` are dev-only defaults. Secrets override them in production.

## Initial Setup

These steps are one-time. Create the D1 databases and put each returned `database_id` in the config files:

```sh
pnpm wrangler d1 create zamak          # wrangler.jsonc, top-level d1_databases
pnpm wrangler d1 create zamak-staging  # wrangler.jsonc previews block and wrangler.preview-migrations.jsonc
```

Set the secrets for production and Previews as above.

In the Cloudflare dashboard, open the `zamak` Worker, then go to Settings > Builds:

1. Connect the `hi-ogawa/ytsub-v5` repository, with `main` as the production branch
2. Set the build command to `pnpm build`
3. Set the deploy command to `pnpm release`
4. Enable Previews, and set the preview command to `pnpm release-preview`

If the dashboard sets up non-production branch builds instead, Previews still get created, but the PR comment has no Preview URL. Switch the Worker to Previews with the [`cf` CLI](https://developers.cloudflare.com/cf/get-started/), taking the Worker's ID from `cf workers scripts search --name zamak`:

```sh
cf workers-builds workers migrate-to-previews <worker-id> --deploy-command "pnpm release-preview"
```
