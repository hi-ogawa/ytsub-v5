# Rename worker `ytsub-v5` → `zamak`

## Context

Preparing for first production deployment. The worker name needs to change from the project codename to the product name before going live, so the public URL is `zamak.hiroshi.workers.dev`.

## Code changes

1. **`wrangler.jsonc`** — `"name": "ytsub-v5"` → `"name": "zamak"`
2. **`vite.ext.config.ts:94`** — worker URL `ytsub-v5.hiroshi.workers.dev` → `zamak.hiroshi.workers.dev`
3. **`.github/workflows/ci.yml:30`** — artifact name `ytsub-extension` → `zamak-extension`
4. **`docs/deployment.md`** — update worker name reference
5. **`docs/chrome-store-submissions.md:139`** — update worker URL mention

### Not changed

- GitHub repo name (`hi-ogawa/ytsub-v5`) — stays, all GitHub URLs unchanged
- D1 database name/ID — unchanged, just re-bound to the new worker
- Historical task docs — no update needed
- `src/components/caption-panel.tsx:235` — links to GitHub repo, not worker

## Manual steps (post-merge)

1. `wrangler deploy` — creates `zamak` worker automatically
2. `wrangler secret put AUTH_PASSWORD --name zamak` (and any other secrets)
3. Run D1 migrations on the new worker
4. Verify the new worker works
5. `wrangler delete --name ytsub-v5` — delete old worker

## Status

- [ ] Code changes
- [ ] Manual deployment
