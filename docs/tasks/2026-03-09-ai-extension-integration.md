# AI Extension Integration — Task Doc

## Problem

Extension users create bookmarks (text selection → save) but the rich metadata fields — **translation**, **etymology**, **notes**, **context** — remain empty. Filling these manually is tedious and defeats the purpose.

## Key Insight

AI browser extensions (Claude for Chrome, etc.) can execute JavaScript on the page. If we expose bookmark data via `window.__zamak`, the AI extension can read bookmarks, generate metadata using its own LLM, and write results back — **zero infrastructure cost**, no API keys, no server proxy.

## Approach: `window.__zamak` API + Prompt Engineering

### Why API-first (not DOM-first)

- **Simpler to implement** — expose data via JS, no editor UI needed initially
- **Bypasses Shadow DOM** — `window.__zamak` works regardless of DOM structure
- **Testable in dev-viewer** — regular page, Claude for Chrome can execute JS
- **Batch-friendly** — AI reads all bookmarks at once, fills all at once
- **Claude for Chrome can execute JS** — confirmed by user testing

### API Surface

```ts
// Exposed on window by the caption session
window.__zamak = {
  // Read: get all bookmarks with caption context
  getBookmarks(): {
    id: string;
    text: string;           // bookmarked Korean word/phrase
    context: string;        // caption text containing the word
    captionContext: {        // surrounding captions for broader context
      text1: string;        // Korean
      text2: string;        // English
    }[];
    translation: string;    // current value (empty if unfilled)
    etymology: string;
    notes: string;
  }[];

  // Write: fill metadata for a bookmark
  fillBookmark(id: string, data: {
    translation?: string;
    etymology?: string;
    notes?: string;
  }): void;

  // Batch write: fill multiple bookmarks at once
  fillBookmarks(entries: {
    id: string;
    translation?: string;
    etymology?: string;
    notes?: string;
  }[]): void;

  // Info
  getVideoContext(): {
    youtubeId: string;
    title: string;
    language1: string;  // e.g. "ko"
    language2: string;  // e.g. "en"
  };
}
```

### Caption Context

For each bookmark, provide surrounding caption rows (not just the single caption where the word appears). This gives the AI enough context to translate accurately:

- The caption row containing the bookmark (text1 + text2)
- 1 row before and 1 row after (configurable)

## Dev-Viewer First

The dev-viewer (`/dev-viewer/:videoId`) is the iteration environment:

- **Regular DOM** — no Shadow DOM issues
- **Hot reload** — `pnpm dev`, instant feedback
- **Fixture data** — pre-fetched YouTube data in `/scripts/youtube-json/`
- Create bookmarks manually in dev-viewer, then test AI fill via Claude for Chrome

## Incremental Plan

### Step 1: Expose `window.__zamak` API

- Hook into `useCaptionSession` — expose bookmarks + video context on `window`
- Include caption context (surrounding rows) for each bookmark
- `fillBookmark` / `fillBookmarks` update React state + persist to localStorage/IndexedDB
- Clean up on unmount

**Where:** New hook `useZamakApi` called from `DevViewerSession` (and later extension). Operates on the `CaptionSessionManager` returned by `useCaptionSession`.

**Needs:** `useCaptionSession` must expose a way to update bookmark metadata (currently only supports add/clear, not update).

### Step 2: Prompt Template

Create a prompt template the user can paste into Claude for Chrome (or any AI chat):

```
Look at window.__zamak.getBookmarks() on this page.
For each Korean bookmark, call window.__zamak.fillBookmarks(...)
with: translation (contextual English meaning), etymology (Hanja
roots / word formation), notes (usage level, related expressions).
```

Test and iterate on the prompt with real bookmarks in the dev-viewer.

### Step 3: Eval Routine

1. Pick 2-3 fixture videos, create 5-10 bookmarks each
2. Run the prompt via Claude for Chrome
3. Evaluate: translation accuracy, etymology usefulness, notes relevance
4. Compare with agent skill output (where available)
5. Track results in a table, iterate on prompt

### Step 4: Bookmark Editor UI (review before export)

After AI fills metadata, user needs to review/edit before exporting. Add a simple editor view to the bookmarks tab:

- Show each bookmark with its AI-filled fields
- Editable `<textarea>` for translation/etymology/notes
- Export button (existing flow, now includes filled metadata)

### Step 5: Extension Adaptation

- Expose `window.__zamak` from extension content script (outside Shadow DOM — it's on `window`)
- Works identically to dev-viewer since API is DOM-independent

## Implementation Details

### Adding `updateBookmark` to caption session

`useCaptionSession` currently supports `addBookmark` and `clearBookmarks`. Need to add:

```ts
updateBookmark(id: string, data: Partial<Pick<ExtensionBookmark, 'translation' | 'etymology' | 'notes'>>): void
```

This updates the bookmark in localStorage + React state + persists to IndexedDB.

### `useZamakApi` hook

```ts
function useZamakApi(
  session: CaptionSessionManager,
  rows: MergedCaption[],
  videoMeta: VideoMeta,
) {
  useEffect(() => {
    window.__zamak = {
      getBookmarks() {
        /* read from session bookmarks + derive caption context from rows */
      },
      fillBookmark(id, data) {
        session.updateBookmark(id, data);
      },
      fillBookmarks(entries) {
        entries.forEach((e) => session.updateBookmark(e.id, e));
      },
      getVideoContext() {
        /* from videoMeta */
      },
    };
    return () => {
      delete window.__zamak;
    };
  }, [session, rows, videoMeta]);
}
```

## Reference Files

- `src/lib/caption-session.ts` — session hook (add `updateBookmark` here)
- `src/lib/extension-bookmarks.ts` — bookmark types + localStorage helpers (add `updateBookmark` here)
- `src/routes/dev-viewer.tsx` — wire up `useZamakApi`
- `src/components/caption-panel.tsx` — later: editor UI

## Status

- **Phase:** Implementing Step 1-2
- **Prerequisites:** Manual bookmarking (merged)
- **Next:** Expose API, test with Claude for Chrome
