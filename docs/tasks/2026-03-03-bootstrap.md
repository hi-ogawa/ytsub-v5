# Bootstrap ytsub-v5

## Context

Setting up ytsub-v5 — a Vite + React SPA with Cloudflare Workers backend, oRPC for API, and D1 for storage. Minimal setup — no shadcn, no lucide, no component library yet. Add UI deps as needed later.

PRD: `docs/prd.md`

## Scaffold

```
ytsub-v5/
  CLAUDE.md                     # → @AGENTS.md
  AGENTS.md                     # agent guide
  index.html
  package.json
  vite.config.ts              # react + tailwind + @cloudflare/vite-plugin
  tsconfig.json               # single tsconfig (src/ + src/server/)
  wrangler.jsonc              # CF Workers + D1 binding
  .gitignore
  docs/                       # (already created)
  src/
    index.tsx                 # React entry point
    styles.css                # Tailwind base
    app.tsx                   # Root component (shell)
    server/
      index.ts                # CF Worker entry — oRPC + OpenAPI handlers
      rpc.ts                  # oRPC router + route handlers
      db.ts                   # D1 helpers / schema
      migrations/
        0001_init.sql         # D1 schema: videos, captions, bookmarks
```

## Key decisions

- **@cloudflare/vite-plugin** (`cloudflare()`) — unified dev + build
- **wrangler.jsonc**: `main: "./src/server/index.ts"`, SPA fallback, `run_worker_first: ["/rpc/*", "/api/*"]`, D1 binding `DB`
- **oRPC**: `RPCHandler` on `/rpc/*` for frontend, `OpenAPIHandler` on `/api/*` for external clients (agent, CLI)
- **tsconfig**: single file, includes both `src/` client and `src/server/` — CF workers types via triple-slash or per-file
- **No UI library yet** — no shadcn, no lucide, no radix. Add as needed later.

## Dependencies

**dependencies**: react, react-dom, @orpc/server, @orpc/client, @orpc/openapi, zod, @tanstack/react-query

**devDependencies**: @cloudflare/vite-plugin, @cloudflare/workers-types, wrangler, vite, @vitejs/plugin-react, @tailwindcss/vite, tailwindcss, typescript, oxfmt

## Scripts

```json
{
  "dev": "vite dev",
  "build": "vite build",
  "preview": "vite preview",
  "tsc": "tsc -b",
  "lint": "oxfmt",
  "deploy": "wrangler deploy",
  "db:migrate": "wrangler d1 execute DB --local --file=src/server/migrations/0001_init.sql"
}
```

## Steps

1. ~~Write CLAUDE.md + AGENTS.md~~ (done)
2. Write package.json with all deps
3. Write config files (vite, tsconfig, wrangler, .gitignore)
4. Write index.html
5. Write src/ client files (index.tsx, styles.css, app.tsx)
6. Write src/server/ files (index.ts, rpc.ts, db.ts)
7. Write D1 migration (0001_init.sql)
8. `pnpm install`
9. `pnpm tsc` to verify types
10. `pnpm build` to verify build

## Verification

- `pnpm tsc` passes
- `pnpm build` produces dist/
- `pnpm dev` starts and shows the app shell

## Status

- Planning complete
- CLAUDE.md + AGENTS.md: done
- Implementation: not started
