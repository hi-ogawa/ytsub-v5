# Rename worker `ytsub-v5` → `zamak`

## Context

Preparing for first production deployment. The worker name needs to change from the project codename to the product name before going live, so the public URL is `zamak.hiroshi.workers.dev`.

## Code changes

1. **`wrangler.jsonc`** — `"name": "ytsub-v5"` → `"name": "zamak"`
2. **`vite.ext.config.ts:94`** — worker URL `ytsub-v5.hiroshi.workers.dev` → `zamak.hiroshi.workers.dev`
3. **`.github/workflows/ci.yml:30`** — artifact name `ytsub-extension` → `zamak-extension`
4. **`docs/deployment.md`** — update worker name reference
5. **`docs/chrome-store-submissions.md:139`** — update worker URL mention

6. **`wrangler.jsonc`** — `database_name` → `zamak`, `database_id` → placeholder (fill after `wrangler d1 create`)

### Not changed

- GitHub repo name (`hi-ogawa/ytsub-v5`) — stays, all GitHub URLs unchanged
- Historical task docs — no update needed
- `src/components/caption-panel.tsx:235` — links to GitHub repo, not worker

## Manual steps (post-merge)

1. `wrangler d1 create zamak` — create fresh D1 database, copy the ID
2. Update `wrangler.jsonc` `database_id` with the new ID
3. `pnpm wrangler d1 migrations apply DB --remote` — apply all migrations from scratch
4. `wrangler secret bulk .dev.vars.production` — set secrets on new worker
5. `wrangler deploy` — deploy the worker
6. Verify the new worker works
7. `wrangler d1 delete 882ee273-02b6-4548-9c0f-087b320e4d8e` — delete old DB
8. `wrangler delete --name ytsub-v5` — delete old worker

## Status

- [ ] Code changes
- [ ] Manual deployment
