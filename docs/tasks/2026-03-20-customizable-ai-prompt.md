# Customizable AI Base Prompt

## Problem

The AI prompt templates in `src/lib/ai-prompt.md` are hardcoded for Korean language learning:

- "Pick **Korean** vocabulary", "learn **Korean**", "Fix **Korean** ASR"
- Korean-specific guidance: TOPIK2 levels, Hanja etymology, Korean example words
- Skip lists reference Korean particles, loanwords, etc.

This makes the prompts useless for anyone learning a different language.

## Approach

Instead of trying to make the hardcoded prompt "language-independent" (which would make it vague and less effective), let the user customize the base prompt text directly.

**Key idea:** Store a user-editable prompt template. Ship the current Korean prompt as the default. Users can edit it to fit their target language.

## Design

### Storage & sync

New key `zamak:ai-prompt` storing the full prompt markdown string. When empty/absent, fall back to the bundled default (`ai-prompt.md`).

Three contexts need access:

1. **Content script** (youtube.com) — reads prompt to build clipboard text. Uses localStorage.
2. **Extension bookmarks page** (chrome-extension://) — settings dialog to edit prompt. Uses chrome.storage.local.
3. **Web app** — reads/edits prompt. Uses localStorage (single origin, no sync needed).

The content script (youtube.com localStorage) and extension page (chrome.storage.local) must stay in sync, same as `zamak:video-index` today.

#### Current video-index sync pattern (ad hoc)

The video-index sync is wired up manually in three places:

- `relay.ts:23` — content script ISOLATED world listens for localStorage change event, calls `bgRpc.videoIndexUpdated()` to push to chrome.storage
- `background.ts:36` — `videoIndexUpdated` handler writes to `chrome.storage.local`
- `bookmarks.tsx:305-311` — extension page hydrates localStorage from chrome.storage on init, then listens for localStorage changes to write back

This works but each synced key requires copy-pasting the same boilerplate.

#### Consolidation: generic synced store

Extract a reusable `createSyncedStore(key, defaultValue)` that handles the localStorage <-> chrome.storage bridge for any key. This lets us add `zamak:ai-prompt` (and future keys) without duplicating wiring.

**Pieces:**

1. **`src/lib/synced-store.ts`** — Creates a localStorage-backed store (reuses `createLocalStorageStore`) and exports the key so relay/background/bookmarks can wire it generically.

2. **`src/extension/relay.ts`** — Instead of hardcoding `VIDEO_INDEX_KEY`, iterate over all synced store keys. On any `zamak:store:<key>` event, forward `{ key, value }` to a single `bgRpc.syncedStoreUpdated` handler.

3. **`src/extension/background.ts`** — Single `syncedStoreUpdated({ key, value })` handler that writes `chrome.storage.local.set({ [key]: value })`.

4. **`src/extension/bookmarks.tsx`** — On init, hydrate all synced stores from chrome.storage. Listen for their change events to write back.

The video-index store and the new ai-prompt store both use this mechanism. Migration: replace the existing ad hoc video-index sync wiring with the generic version.

### UI

**Content script (caption panel):** Cannot open a modal (shadow DOM constraints). The "Edit prompt" button in `AiPromptCopy` links to the extension bookmarks page with `?settings=ai-prompt` query param. The extension page auto-opens the settings dialog on that section.

**Extension bookmarks page:** Add a "Settings" menu item (visible to all users, not just `__DEV_EXT__`). The settings dialog includes an "AI Prompt" section with:

- A `<textarea>` pre-filled with the current prompt template (user-customized or default)
- "Reset to default" button to restore the bundled prompt
- "Save" / "Cancel" buttons

On save, writes to both localStorage store and chrome.storage. The relay picks up the localStorage change and syncs to the content script's youtube.com localStorage next time it loads.

**Web app:** Same settings dialog, reachable from the header menu. No sync complexity (single origin).

### Code changes

1. **`src/lib/synced-store.ts`** (new) — Generic synced store registry. Exports `SYNCED_STORES` (map of key -> store) for relay/background/bookmarks to iterate.

2. **`src/lib/ai-prompt.ts`** — Export the default prompt string. Refactor section parsing into a function (`parseSections(source)`) so it can accept custom prompt text. Update `makeAiPrompt` to accept optional custom source.

3. **`src/lib/video-index.ts`** — Register with synced store registry (or just export key for the registry).

4. **`src/extension/relay.ts`** — Replace hardcoded video-index listener with generic loop over `SYNCED_STORES`.

5. **`src/extension/background.ts`** — Replace `videoIndexUpdated` with generic `syncedStoreUpdated`.

6. **`src/extension/bookmarks.tsx`** — Replace ad hoc video-index hydration with generic synced store hydration. Add settings dialog with AI prompt editor. Handle `?settings=ai-prompt` URL param to auto-open.

7. **`src/components/caption-panel.tsx`** — In `AiPromptCopy`: read prompt from synced store, add "Edit prompt" link (extension: links to bookmarks page with query; web app: opens dialog inline).

## Reference files

- `src/lib/ai-prompt.md` — current hardcoded prompt templates
- `src/lib/ai-prompt.ts` — prompt builder (`makeAiPrompt`, section parsing)
- `src/lib/external-store.ts` — `createLocalStorageStore` helper
- `src/lib/video-index.ts` — current synced store (ad hoc)
- `src/extension/relay.ts` — localStorage -> chrome.storage relay (ad hoc for video-index)
- `src/extension/background.ts:35-37` — `videoIndexUpdated` handler
- `src/extension/bookmarks.tsx:302-311` — video-index hydration + sync-back
- `src/components/caption-panel.tsx:184-277` — `AiPromptCopy` widget

## Implementation steps

1. Create `src/lib/synced-store.ts` — generic synced store registry
2. Migrate video-index to use synced store registry
3. Add `zamak:ai-prompt` synced store
4. Refactor relay.ts, background.ts, bookmarks.tsx to use generic sync
5. Refactor `ai-prompt.ts`: extract `parseSections(source)`, update `makeAiPrompt`
6. Add settings dialog to extension bookmarks page with AI prompt editor
7. Wire `?settings=ai-prompt` auto-open
8. Update `AiPromptCopy` — read from store, add edit link (extension) / edit button (web app)
9. E2e test: edit prompt in settings, verify it's used when copying
10. Update `docs/ai-integration.md` to mention customization

## Feedback log

- **2026-03-20:** User feedback: (1) Can't do modal in content script — link to extension page with query param to auto-open. (2) Extension page should have a settings dialog. (3) Content script localStorage and chrome.storage must stay in sync (like video-index). (4) Consolidate the synced storage mechanism with a better abstraction instead of duplicating ad hoc wiring.

## Status

- Plan revised with feedback, awaiting approval
