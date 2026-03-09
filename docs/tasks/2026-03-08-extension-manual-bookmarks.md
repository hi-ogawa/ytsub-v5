# Extension Manual Bookmarks

## Problem

The extension (and dev-viewer) caption panel has no bookmarking. Users should be able to select text in captions and create bookmarks stored in localStorage, then export them in `import.json`.

## Status

Steps 1-6 (basic bookmark creation) are implemented. Remaining:

- [ ] **Refactor: extract CaptionSession data layer** (section C — do first, enables A+B cleanly)
- [ ] **A. Dev-viewer parity** — wire bookmarks in `dev-viewer.tsx`
- [ ] **B. Track change guard** — disable track/alignment when bookmarks exist
- [ ] Verify: `pnpm build`, test in dev-viewer

## What's Done

- `src/lib/extension-bookmarks.ts` — localStorage CRUD + `extractBookmarkSelection()` DOM walk
- `src/components/caption-list.tsx` — `data-side`, `data-offset` attributes + `highlightText()` rendering
- `src/components/caption-panel.tsx` — selection handling, floating FABs, export with bookmarks
- `src/extension/content.tsx` — bookmark state + callbacks wired to `CaptionPanel`

## C. Architecture: CaptionSession data layer

### Problem with current `caption-panel.tsx`

`CaptionPanel` (203-465) mixes too many concerns:

- Track selection state + localStorage persistence (L148-199)
- Fetching json3 via `useQuery` (L237-247)
- Merging captions (L251-263)
- Auto-scroll toggle + localStorage (L222-273)
- Bookmark selection handling + FABs (L275-308)
- Export logic (L310-357)
- Playback sync (`CaptionViewer`, L469-515)

Adding IndexedDB persistence + session hydration on top would make it worse. The core issue: `CaptionPanel` owns both "how to get captions" (track → fetch → merge) and "what to do with captions" (display, bookmarks, export).

### Solution: `useCaptionSession` hook

Extract the data pipeline into a hook that manages the session lifecycle. `CaptionPanel` becomes a pure display component.

```ts
// src/lib/caption-session.ts

interface CaptionSession {
  youtubeId: string;
  vssId1: string;
  vssId2: string;
  language1: string;
  language2: string;
  captions: MergedCaption[];
  bookmarks: ExtensionBookmark[];
}

// Hook manages:
// 1. Track selection (with localStorage preference)
// 2. Fetch + merge (via caller-provided fetchJson3)
// 3. Session persistence (IndexedDB — once bookmarks exist)
// 4. Bookmark CRUD
// 5. Lock state (tracks locked when bookmarks exist)

function useCaptionSession(opts: {
  youtubeId: string;
  tracks: YouTubeCaptionTrack[];
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;
}): {
  // Track selection
  selectedVssId1: string | undefined;
  selectedVssId2: string | undefined;
  setTracks: (v1: string | undefined, v2: string | undefined) => void;
  tracksLocked: boolean; // true when bookmarks exist

  // Caption data
  rows: MergedCaption[] | undefined;
  error: Error | null;
  activeStrategy: MergeStrategy | undefined;
  isAutoStrategy: boolean;
  forceStrategy: MergeStrategy | undefined;
  setForceStrategy: (s: MergeStrategy | undefined) => void;

  // Bookmarks
  bookmarks: ExtensionBookmark[];
  bookmarksByIndex: Map<number, ExtensionBookmark[]>;
  addBookmark: (
    sel: BookmarkSelection & { timestamp: number; context: string },
  ) => void;
  clearBookmarks: () => void; // clears bookmarks + persisted session, unlocks tracks

  // Export
  exportSession: (videoMeta: VideoMeta) => void;
};
```

### Session lifecycle

```
                  ┌─────────────────┐
                  │  No session in  │
                  │   IndexedDB     │
                  └────────┬────────┘
                           │
              ┌────────────▼────────────┐
              │  Fresh: pick tracks,    │
              │  fetch json3, merge     │
              │  (tracks unlocked)      │
              └────────────┬────────────┘
                           │ first bookmark created
              ┌────────────▼────────────┐
              │  Persisted: save        │
              │  captions + bookmarks   │
              │  to IndexedDB           │
              │  (tracks locked)        │
              └────────────┬────────────┘
                           │ reload
              ┌────────────▼────────────┐
              │  Hydrated: load from    │
              │  IndexedDB, skip fetch  │
              │  (tracks locked)        │
              └────────────┬────────────┘
                           │ "Clear bookmarks"
                           │
              ┌────────────▼────────────┐
              │  Back to Fresh          │
              │  (delete IndexedDB      │
              │   record, unlock)       │
              └─────────────────────────┘
```

### What changes per file

**New: `src/lib/caption-session.ts`**

- `CaptionSession` type
- `useCaptionSession()` hook
- IndexedDB helpers (thin wrapper — `idb-keyval` or raw `indexedDB`)
- Absorbs track preference logic from `caption-panel.tsx` (L148-199)
- Absorbs bookmark CRUD from `extension-bookmarks.ts` (or calls it internally)

**`src/components/caption-panel.tsx`** — simplifies dramatically:

- Remove: track selection state, `useQuery` for json3, `mergeCaptions`, bookmark state, export logic
- Keep: UI rendering (toolbar, dropdown, FABs, `CaptionViewer`)
- New props: receive everything from `useCaptionSession` return value

```tsx
// After refactor, CaptionPanel props become:
interface CaptionPanelProps {
  // From useCaptionSession
  tracks: YouTubeCaptionTrack[];
  selectedVssId1: string | undefined;
  selectedVssId2: string | undefined;
  onSelectTracks: (v1: string | undefined, v2: string | undefined) => void;
  tracksLocked: boolean;
  rows: MergedCaption[] | undefined;
  error: Error | null;
  activeStrategy: MergeStrategy | undefined;
  isAutoStrategy: boolean;
  forceStrategy: MergeStrategy | undefined;
  onSetForceStrategy: (s: MergeStrategy | undefined) => void;
  bookmarksByIndex: Map<number, ExtensionBookmark[]>;
  onCreateBookmark?: (
    sel: BookmarkSelection & { timestamp: number; context: string },
  ) => void;
  onClearBookmarks?: () => void;
  onExport?: () => void;
  // Kept
  player: YTPlayer | null;
}
```

**`src/extension/content.tsx`** — simplifies:

- Remove: bookmark state, `useMemo` for bookmarksByIndex, `useCallback` for onCreateBookmark
- Add: `useCaptionSession()` call, spread results to `CaptionPanel`

**`src/routes/dev-viewer.tsx`** — same pattern as content.tsx:

- Add: `useCaptionSession()` call, spread results to `CaptionPanel`
- Solves A (dev-viewer parity) automatically

**`src/components/track-picker.tsx`**:

- Add `disabled` prop, apply to both `<select>` elements + title attribute

### IndexedDB approach

Keep it simple — raw `indexedDB` API wrapped in ~30 lines (get/set/delete for a single object store). No library needed for a single key-value store.

```ts
// src/lib/caption-session-db.ts
const DB_NAME = "zamak";
const STORE_NAME = "caption-sessions";

function openDb(): Promise<IDBDatabase>;
function getSession(youtubeId: string): Promise<CaptionSession | undefined>;
function saveSession(session: CaptionSession): Promise<void>;
function deleteSession(youtubeId: string): Promise<void>;
```

### Implementation order

1. Create `src/lib/caption-session-db.ts` — IndexedDB helpers
2. Create `src/lib/caption-session.ts` — `useCaptionSession` hook
3. Refactor `caption-panel.tsx` — receive data via props instead of managing it
4. Update `track-picker.tsx` — add `disabled` prop
5. Update `content.tsx` — use `useCaptionSession`, pass to `CaptionPanel`
6. Update `dev-viewer.tsx` — same as content.tsx (solves A)
7. B (track lock + clear bookmarks in dropdown) comes free from the hook's `tracksLocked` + `clearBookmarks`

## A. Dev-viewer parity

Solved by step 6 above — `dev-viewer.tsx` uses the same `useCaptionSession` hook as `content.tsx`.

## B. Track change guard

Solved by the hook — `tracksLocked` is `true` when `bookmarks.length > 0`. `CaptionPanel` disables `TrackPicker` and alignment `<select>` based on this flag. "Clear bookmarks" in dropdown calls `clearBookmarks()`.

## Data Model

`ExtensionBookmark` aligns with DB `bookmarks` table (`src/server/schema.ts`):

```ts
// DB bookmarks table columns:
// id, videoId, captionId, text, side, offset, translation, context, timestamp, etymology, notes, status, createdAt

// src/lib/extension-bookmarks.ts
type ExtensionBookmark = {
  id: string; // crypto.randomUUID() (DB uses int autoincrement)
  text: string; // = DB text
  side: number; // = DB side
  offset: number; // = DB offset
  captionIndex: number; // maps to DB captionId (resolved on import)
  timestamp: number; // = DB timestamp
  context: string; // = DB context
  translation: string; // = DB translation (default "")
  etymology: string; // = DB etymology (default "")
  notes: string; // = DB notes (default "")
  createdAt: string; // = DB createdAt (ISO string)
};
```

Fields omitted from client model (server-only concerns): `videoId` (implicit from storage key), `captionId` (resolved on import from captionIndex), `status` (inferred as "manual" on export).

## Reference Files

| File                               | Role                                            |
| ---------------------------------- | ----------------------------------------------- |
| `src/lib/extension-bookmarks.ts`   | localStorage CRUD + selection extraction        |
| `src/lib/caption-merge.ts`         | `MergedCaption` type, `mergeCaptions()`         |
| `src/components/caption-list.tsx`  | Shared caption rendering with highlight support |
| `src/components/caption-panel.tsx` | Selection handling, FABs, export, track picker  |
| `src/components/track-picker.tsx`  | Track selection dropdowns                       |
| `src/extension/content.tsx`        | Extension wiring                                |
| `src/routes/dev-viewer.tsx`        | Dev-viewer wiring                               |
| `src/routes/video-viewer.tsx`      | Reference: server-backed bookmark system        |

## Future: Unify Extension ↔ Server

Goal: extension/dev-viewer (client-only, IndexedDB) and server app (D1 DB) should converge. `ExtensionBookmark` fields already align with DB `bookmarks` table. Future work:

- Extension syncs bookmarks to server (or import.json acts as the bridge)
- Caption panel tabs (captions + bookmark list) shared across both worlds — see follow-up item D
- AI extension integration via `window.__zamak` API to fill translation/etymology/notes

### D. Caption panel tabs (follow-up)

The server app's video-viewer has two tabs in the caption panel: **Captions** and **Bookmarks** list. Add the same tab structure to the shared `CaptionPanel`. Not blocking current work — tracked in prd.md.

## Feedback Log

- 2026-03-09: User feedback — three issues:
  1. Dev-viewer must have same bookmark experience as extension
  2. Track change after bookmarks breaks alignment — need UX guard
  3. Persisted bookmarks need track metadata binding to detect staleness
- 2026-03-09: User feedback — design direction: 4. ExtensionBookmark should align with DB bookmarks schema for future unification 5. Server viewer's caption/bookmark tabs should come to extension/dev-viewer too (follow-up)
- 2026-03-09: User feedback — persist captions alongside bookmarks (IndexedDB), support future caption editing. Architect C first since caption-panel.tsx is already messy.
