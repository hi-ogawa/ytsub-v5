# Caption Panel Bookmarks Tab

## Problem

The shared `CaptionPanel` (used by extension + dev-viewer) shows captions but has no bookmarks list tab. The server viewer (`video-viewer.tsx`) has a tabbed UI with Captions/Bookmarks tabs. We need to match that UI in the shared component.

## Approach

Adapt the server viewer's tabbed pattern to the shared `CaptionPanel`, using `ExtensionBookmark` (localStorage-backed) instead of server-side bookmarks.

## Reference

- Server viewer bookmarks tab: `src/routes/video-viewer.tsx` (BookmarksList, lines 321-463)
- Shared panel: `src/components/caption-panel.tsx`
- Extension bookmarks: `src/lib/extension-bookmarks.ts`
- Session manager: `src/lib/caption-session.ts`

## Implementation Steps

1. **`extension-bookmarks.ts`**: Add `deleteBookmark(youtubeId, bookmarkId)` function
2. **`caption-session.ts`**: Expose `bookmarks` (sorted by timestamp), `onDeleteBookmark` callback
3. **`caption-panel.tsx`**:
   - Add `activeTab` state (captions | bookmarks)
   - Add tab bar with Captions / Bookmarks buttons + bookmark count badge
   - Add bookmark prev/next navigation buttons
   - Add `ExtensionBookmarksList` component matching server's `BookmarksList`:
     - Click to seek + play
     - Show text, translation, etymology, notes
     - Show caption context (text1/text2 via `captionIndex` from `rows`)
     - Delete via dropdown menu
     - "Go to caption" button → switch to captions tab + scroll
     - Flash highlight animation
   - Hide (not unmount) CaptionList when bookmarks tab active
4. Build + lint

## Status

- In progress
