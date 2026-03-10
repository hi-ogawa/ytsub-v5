# Zamak

A web app for language learning via YouTube subtitles. Watch videos with dual subtitle panel, bookmark words/phrases, and build vocabulary.

## Development

```bash
# web app
pnpm install
pnpm db:bootstrap
pnpm dev

# extension
pnpm dev-ext
# load dist/extension-dev as unpacked extension in Chrome.
# all worktrees (name-wt1, name-wt2, ...) copy to the main repo's
# dist/extension-dev, so Chrome always loads from a single path.
# the extension name on chrome://extensions shows branch, rev, and build time.
```
