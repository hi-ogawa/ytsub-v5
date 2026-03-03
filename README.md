# ytsub-v5

A web app for language learning via YouTube subtitles. Watch videos with dual subtitle panel, bookmark words/phrases, and build vocabulary.

## Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, shadcn
- **Backend**: Cloudflare Workers, D1 (SQLite)
- **API**: oRPC (type-safe RPC + OpenAPI)

## Development

```bash
pnpm install
pnpm db:migrate
pnpm dev
```
