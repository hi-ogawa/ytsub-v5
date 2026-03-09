# Extension Manual Bookmarks

## Problem

The extension (and dev-viewer) caption panel has no bookmarking. Users should be able to select text in captions and create bookmarks stored in localStorage, then export them in `import.json`.

## Status

Steps 1-6 are implemented. Remaining work:

- [ ] **Dev-viewer parity** — wire bookmarks in `dev-viewer.tsx` (same pattern as `content.tsx`)
- [ ] **Track change guard** — warn + clear bookmarks when user changes tracks after bookmarks exist
- [ ] **Bookmark-track binding** — persist which tracks were active when bookmarks were created, detect mismatch on reload
- [ ] Verify: `pnpm build`, test in dev-viewer

## What's Done

- `src/lib/extension-bookmarks.ts` — localStorage CRUD + `extractBookmarkSelection()` DOM walk
- `src/components/caption-list.tsx` — `data-side`, `data-offset` attributes + `highlightText()` rendering
- `src/components/caption-panel.tsx` — selection handling, floating FABs, export with bookmarks
- `src/extension/content.tsx` — bookmark state + callbacks wired to `CaptionPanel`

## Remaining Work

### A. Dev-viewer parity

`src/routes/dev-viewer.tsx` doesn't pass `onCreateBookmark` or `bookmarksByIndex` to `CaptionPanel`. Wire the same pattern as `content.tsx`:

```tsx
// In DevViewerPage, add:
const [bookmarks, setBookmarks] = useState<ExtensionBookmark[]>(() => getBookmarks(videoId));

const bookmarksByIndex = useMemo(() => {
  const map = new Map<number, ExtensionBookmark[]>();
  for (const bm of bookmarks) {
    const list = map.get(bm.captionIndex);
    if (list) list.push(bm);
    else map.set(bm.captionIndex, [bm]);
  }
  return map;
}, [bookmarks]);

const onCreateBookmark = useCallback((sel) => {
  addBookmark(videoId, { text: sel.text, side: sel.side, offset: sel.offset, captionIndex: sel.captionIndex, timestamp: sel.timestamp, context: sel.context });
  setBookmarks(getBookmarks(videoId));
}, [videoId]);

// Then pass to CaptionPanel:
<CaptionPanel ... onCreateBookmark={onCreateBookmark} bookmarksByIndex={bookmarksByIndex} />
```

### B. Track change guard

Problem: bookmarks store `captionIndex` tied to the merged rows array. Changing tracks produces a different merge, making all indices invalid. Currently bookmarks silently point to wrong rows or disappear.

Solution: **warn + clear**. In `CaptionPanel`, when tracks change and bookmarks exist:

- Show a confirmation: "Changing tracks will discard N bookmarks. Continue?"
- If confirmed: clear bookmarks for this video, proceed with track change
- If cancelled: revert track selection

This requires a new optional callback prop on `CaptionPanel`:

```ts
onClearBookmarks?: () => void; // called when tracks change and bookmarks need clearing
```

The track picker `onSelect` handler checks `bookmarksByIndex?.size > 0` before applying the change.

### C. Bookmark-track binding

Problem: bookmarks are stored in `zamak:bookmarks:{videoId}` but there's no record of which tracks were active. On reload, if tracks resolve differently (e.g., YouTube changes available tracks, or user's language preferences changed), bookmarks become stale with no detection.

Solution: store a fingerprint alongside bookmarks:

```ts
// In extension-bookmarks.ts, change storage shape:
type BookmarkStore = {
  trackKey: { vssId1: string; vssId2: string }; // tracks active when bookmarks were created
  bookmarks: ExtensionBookmark[];
};
```

On load, compare stored `trackKey` against current selected tracks. If mismatch → warn user and clear bookmarks.

This naturally integrates with (B): the same guard logic applies both to explicit track changes and stale-on-reload detection.

## Data Model

`ExtensionBookmark` should align with the DB `bookmarks` table schema (`src/server/schema.ts`) to simplify future unification (extension/dev-viewer → server data).

```ts
// DB bookmarks table columns:
// id, videoId, captionId, text, side, offset, translation, context, timestamp, etymology, notes, status, createdAt

// src/lib/extension-bookmarks.ts — client-only subset
type ExtensionBookmark = {
  id: string;            // crypto.randomUUID() (DB uses int autoincrement, but string UUID is fine for localStorage)
  text: string;          // = DB text
  side: number;          // = DB side
  offset: number;        // = DB offset
  captionIndex: number;  // maps to DB captionId (index in merged rows → resolved to caption FK on import)
  timestamp: number;     // = DB timestamp
  context: string;       // = DB context
  createdAt: string;     // = DB createdAt (ISO string)
};
// localStorage key: zamak:bookmarks:{youtubeId}
```

Fields intentionally omitted from client model (server-only concerns): `videoId` (implicit from storage key), `captionId` (resolved on import from captionIndex), `translation`, `etymology`, `notes`, `status`.

## Reference Files

| File                               | Role                                            |
| ---------------------------------- | ----------------------------------------------- |
| `src/lib/extension-bookmarks.ts`   | localStorage CRUD + selection extraction         |
| `src/components/caption-list.tsx`  | Shared caption rendering with highlight support  |
| `src/components/caption-panel.tsx` | Selection handling, FABs, export, track picker   |
| `src/extension/content.tsx`        | Extension wiring (done)                          |
| `src/routes/dev-viewer.tsx`        | Dev-viewer wiring (needs bookmark props)         |
| `src/routes/video-viewer.tsx`      | Reference: server-backed bookmark system         |

## Future: Unify Extension ↔ Server

Goal: extension/dev-viewer (client-only, localStorage) and server app (D1 DB) should converge. `ExtensionBookmark` fields already align with DB `bookmarks` table. Future work:

- Extension syncs bookmarks to server (or import.json acts as the bridge)
- Caption panel tabs (captions + bookmark list) shared across both worlds — see follow-up item D below

### D. Caption panel tabs (follow-up)

The server app's video-viewer (`src/routes/video-viewer.tsx`) has two tabs in the caption panel: **Captions** and **Bookmarks** list. The extension/dev-viewer `CaptionPanel` currently only shows captions. Add the same tab structure to the shared `CaptionPanel` component so both worlds have it.

Not blocking current work — tracked in prd.md.

## Feedback Log

- 2026-03-09: User feedback — three issues:
  1. Dev-viewer must have same bookmark experience as extension
  2. Track change after bookmarks breaks alignment — need UX guard
  3. Persisted bookmarks need track metadata binding to detect staleness
- 2026-03-09: User feedback — design direction:
  4. ExtensionBookmark should align with DB bookmarks schema for future unification
  5. Server viewer's caption/bookmark tabs should come to extension/dev-viewer too (follow-up)
