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

```sh
# 1. Create fresh D1 database, copy the ID
pnpm wrangler d1 create zamak

# 2. Update wrangler.jsonc database_id with the new ID
# (manual edit)

# 3. Apply all migrations from scratch
pnpm wrangler d1 migrations apply DB --remote

# 4. Set secrets on new worker
pnpm wrangler secret bulk .dev.vars.production

# 5. Deploy the worker
pnpm wrangler deploy

# 6. Verify the new worker works
# (manual check)

# 7. Delete old DB
pnpm wrangler d1 delete ytsub-v5

# 8. Delete old worker
pnpm wrangler delete --name ytsub-v5
```

## Status

- [ ] Code changes
- [ ] Manual deployment
