# Bootstrap ytsub-v5

## Context

Setting up ytsub-v5 — a Vite + React SPA with Cloudflare Workers backend, oRPC for API, and D1 for storage. Following the same patterns as toy-midi and anki-tools (React 19, Tailwind 4, shadcn, oxfmt, Playwright).

PRD: `docs/prd.md`

## Scaffold

```
ytsub-v5/
  CLAUDE.md                     # → @AGENTS.md
  AGENTS.md                     # agent guide (quick ref, conventions, workflow)
  index.html
  package.json
  vite.config.ts              # react + tailwind + @cloudflare/vite-plugin
  tsconfig.json               # project references (app + worker)
  tsconfig.app.json           # frontend TS
  tsconfig.worker.json        # worker TS (with @cloudflare/workers-types)
  wrangler.jsonc              # CF Workers + D1 binding
  components.json             # shadcn config
  .gitignore
  docs/
    prd.md                    # product requirements
    brainstorm.md             # design decisions
    skill-integration.md      # agent skill notes
    references/               # research (prior repos, similar projects)
    tasks/                    # task docs (YYYY-MM-DD-topic.md)
  src/
    index.tsx                 # React entry point
    styles.css                # Tailwind + shadcn theme (from anki-tools)
    app.tsx                   # Root component (shell)
    lib/
      utils.ts                # cn() helper
    components/
      ui/                     # shadcn (add as needed)
  worker/
    index.ts                  # CF Worker entry — oRPC + OpenAPI handlers
    router.ts                 # oRPC router definition
    procedures/
      videos.ts               # Video CRUD (stub)
    migrations/
      0001_init.sql           # D1 schema: videos, captions, bookmarks
```

## Key decisions

- **@cloudflare/vite-plugin** (`cloudflare()`) — unified dev + build
- **wrangler.jsonc**: `main: "./worker/index.ts"`, SPA fallback, `run_worker_first: ["/rpc/*", "/api/*"]`, D1 binding `DB`
- **oRPC**: `RPCHandler` on `/rpc/*` for frontend, `OpenAPIHandler` on `/api/*` for external clients (agent, CLI)
- **tsconfig**: project references — `tsconfig.app.json` (src/) + `tsconfig.worker.json` (worker/)

## Dependencies

**dependencies**: react, react-dom, @orpc/server, @orpc/client, @orpc/openapi, zod, @tanstack/react-query, sonner, clsx, tailwind-merge, class-variance-authority, lucide-react, @radix-ui/react-slot

**devDependencies**: @cloudflare/vite-plugin, @cloudflare/workers-types, wrangler, vite, @vitejs/plugin-react, @tailwindcss/vite, tailwindcss, typescript, oxfmt, @playwright/test, @types/react, @types/react-dom

## Scripts

```json
{
  "dev": "vite dev",
  "build": "vite build",
  "preview": "vite preview",
  "tsc": "tsc -b",
  "lint": "oxfmt",
  "deploy": "wrangler deploy",
  "db:migrate": "wrangler d1 execute DB --local --file=worker/migrations/0001_init.sql"
}
```

## Steps

1. Write CLAUDE.md + AGENTS.md
2. Write package.json with all deps
3. Write config files (vite, tsconfig x3, wrangler, components.json, .gitignore)
4. Write index.html
5. Write src/ files (index.tsx, styles.css, app.tsx, lib/utils.ts)
6. Write worker/ files (index.ts, router.ts, procedures/videos.ts)
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
- Implementation: not started
