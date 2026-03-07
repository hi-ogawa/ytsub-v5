# Show Video Thumbnails in Video List

## Problem

The video list currently shows text-only cards (title, channel, duration, language pair, date). Adding thumbnails will make the list more visually scannable and recognizable.

## Approach

YouTube provides predictable thumbnail URLs based on `youtubeId`:

- `https://img.youtube.com/vi/{youtubeId}/mqdefault.jpg` (320x180, good balance of size/quality)

Since we already have `youtubeId` on each video, **no schema or API changes are needed** — construct the URL client-side.

## Reference Files

| File                                | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `src/routes/video-list.tsx:200-239` | Video card grid (modify here)             |
| `src/server/schema.ts:11-23`        | Videos table schema (youtubeId available) |

## Implementation Steps

1. In `video-list.tsx`, add an `<img>` element to each card using `https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`
2. Place thumbnail above the title text, spanning full card width
3. Remove card padding on top so thumbnail is edge-to-edge, keep padding for text content below
4. Add `loading="lazy"` for performance
5. Verify with `pnpm build`
6. Add E2E test for thumbnail rendering
7. Run `pnpm test-e2e` to verify
8. Create PR

## Status

- **Plan created**, awaiting feedback
