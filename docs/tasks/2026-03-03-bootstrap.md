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
- Implementation: done — all files created, `pnpm tsc` and `pnpm build` pass

---

# Bootstrap ytsub-v5 — Implementation Plan

## Context

Execute the scaffold defined in `docs/tasks/2026-03-03-bootstrap.md`. All design decisions are made. This plan contains the concrete file contents to write.

## Files to create (in order)

### 1. package.json

```json
{
  "name": "ytsub-v5",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "tsc": "tsc -b",
    "lint": "oxfmt",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@orpc/server": "latest",
    "@orpc/client": "latest",
    "@orpc/openapi": "latest",
    "zod": "latest",
    "@tanstack/react-query": "^5"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "latest",
    "@cloudflare/workers-types": "latest",
    "wrangler": "latest",
    "vite": "^7",
    "@vitejs/plugin-react": "^5",
    "@tailwindcss/vite": "^4",
    "tailwindcss": "^4",
    "typescript": "^5",
    "oxfmt": "latest",
    "@types/react": "^19",
    "@types/react-dom": "^19"
  }
}
```

### 2. vite.config.ts

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
```

### 3. tsconfig.json

Single tsconfig. Use `@cloudflare/workers-types` in types for server code (triple-slash in server files if needed to avoid polluting client).

```json
{
  "include": ["src"],
  "compilerOptions": {
    "target": "esnext",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "types": ["vite/client"]
  }
}
```

### 4. wrangler.jsonc

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "ytsub-v5",
  "compatibility_date": "2026-03-03",
  "main": "./src/server/index.ts",
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/rpc/*", "/api/*"],
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ytsub-v5",
      "database_id": "local",
    },
  ],
}
```

### 5. .gitignore

```
node_modules/
dist/
*.tsbuildinfo
.wrangler/
```

### 6. index.html

Same pattern as anki-tools. Minimal, Inter font.

### 7. src/styles.css

Minimal Tailwind — just `@import "tailwindcss";` and basic body styles. No shadcn theme variables.

### 8. src/index.tsx

React 19 createRoot, render `<App />` with QueryClientProvider.

### 9. src/app.tsx

Placeholder shell — "ytsub-v5" heading, maybe a fetch to the server health endpoint to prove the connection works.

### 10. src/server/index.ts

CF Worker fetch handler. Routes `/rpc/*` to oRPC RPCHandler, `/api/*` to OpenAPI handler, everything else falls through to SPA. Triple-slash `/// <reference types="@cloudflare/workers-types" />` at top.

### 11. src/server/rpc.ts

oRPC router with a single `health` procedure that returns `{ ok: true }`. Stub for videos procedures.

### 12. src/server/db.ts

Placeholder — export type for D1 env binding. Will add schema/helpers when we implement features.

### 13. src/server/migrations/0001_init.sql

Create tables per PRD:

```sql
CREATE TABLE videos ( ... );
CREATE TABLE captions ( ... );
CREATE TABLE bookmarks ( ... );
```

## Execution

1. Write all files above
2. `pnpm install`
3. `pnpm tsc` — fix any type issues
4. `pnpm build` — verify build
5. Commit

## Verification

- `pnpm tsc` passes
- `pnpm build` succeeds
- `pnpm dev` shows the app shell and health check works
