# Caption Panel Settings Menu

## Problem

The caption panel header is cluttered with alignment select and autoscroll toggle inline. The PRD calls for a settings dropdown menu (vertical dots icon) next to the track picker that consolidates these controls and adds an export feature.

Current header layout:

```
[Track 1 select] [Track 2 select] [Alignment select] [AutoScroll btn]
```

Target layout:

```
[Track 1 select] [Track 2 select] [⋮ settings menu]
```

## PRD Requirements

From `docs/prd.md`:

- Vertical dot icon next to track picker
- Move alignment select and autoscroll toggle inside the dropdown
- Add export `import.json` to be imported on main app

## Approach

Add a `DropdownMenu` (already exists at `src/components/ui/dropdown-menu.tsx`, used in video-list.tsx) to the caption panel header. The menu replaces the inline alignment select and autoscroll button.

### Menu items

1. **Auto-scroll** — toggle item, shows current state (on/off checkmark or similar)
2. **Alignment** — sub-label + select or radio group for merge strategy (only shown when `!isAutoStrategy`, same condition as current)
3. **Export import.json** — generates and downloads a JSON file matching the `importVideo` API shape

### Export format

The export must match the `importVideo` input schema (from `src/server/routes/videos.ts`):

```ts
{
  video: { youtubeId, title, channelName?, channelId?, duration?, language1?, language2? },
  captions: [{ idx, begin, end, text1?, text2? }],
  bookmarks: []  // empty — extension doesn't have bookmarks
}
```

The extension already has access to:

- Video metadata from `fetchPlayerApi()` response (youtubeId, title, channel info)
- Caption cues from both selected tracks (after merge = aligned rows with begin, end, text1, text2)

The `CaptionPanel` needs to receive video metadata to build the export. Currently it only gets `tracks`, `fetchCues`, `player`. Options:

- **Option A**: Pass video metadata as new prop to `CaptionPanel`
- **Option B**: Pass an `onExport` callback that the parent constructs with the right data

Option A is simpler — add a `videoMeta` prop with the fields needed for export.

## Reference files

| File                                  | Role                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `src/components/caption-panel.tsx`    | Main file to edit — add dropdown, move controls          |
| `src/components/ui/dropdown-menu.tsx` | Existing Radix dropdown components                       |
| `src/routes/video-list.tsx`           | Reference for DropdownMenu usage pattern (lines 232-265) |
| `src/extension/content.tsx`           | Passes props to CaptionPanel — needs to pass videoMeta   |
| `src/routes/dev-viewer.tsx`           | Also uses CaptionPanel — needs to pass videoMeta         |
| `src/server/routes/videos.ts`         | importVideo schema — export must match this              |
| `src/lib/youtube.ts`                  | fetchPlayerApi return type (video metadata)              |

## Implementation Steps

### 1. Add settings dropdown to `CaptionPanel` header (`caption-panel.tsx`)

- Import `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` from `./ui/dropdown-menu.tsx`
- Import `EllipsisVertical` from `lucide-react` (already used in video-list.tsx)
- Replace the inline alignment select + autoscroll button with a single `⋮` trigger button
- Inside dropdown content:
  - **Auto-scroll toggle**: `DropdownMenuItem` that toggles state, shows checkmark or indicator
  - **Alignment strategy**: Show current strategy label + select (only when `!isAutoStrategy`). Could be a group of items or keep the native `<select>` inside the dropdown.
  - **Separator**
  - **Export import.json**: `DropdownMenuItem` that triggers download

### 2. Add `videoMeta` prop to `CaptionPanel`

```ts
interface VideoMeta {
  youtubeId: string;
  title: string;
  channelName?: string;
  channelId?: string;
  duration?: number;
}
```

Add optional `videoMeta?: VideoMeta` prop. When present, show the Export menu item.

### 3. Implement export function

```ts
function handleExport() {
  const data = {
    video: {
      youtubeId: videoMeta.youtubeId,
      title: videoMeta.title,
      channelName: videoMeta.channelName ?? "",
      channelId: videoMeta.channelId ?? "",
      duration: videoMeta.duration ?? 0,
      language1: sel1?.languageCode ?? "ko",
      language2: sel2?.languageCode ?? "en",
    },
    captions: rows.map((r, i) => ({
      idx: i,
      begin: r.begin,
      end: r.end,
      text1: r.text1,
      text2: r.text2,
    })),
    bookmarks: [],
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `import-${videoMeta.youtubeId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### 4. Update callers to pass `videoMeta`

- **`src/extension/content.tsx`**: `ExtensionViewer` already fetches player metadata via `fetchPlayerApi()`. Pass it to `CaptionPanel` as `videoMeta`.
- **`src/routes/dev-viewer.tsx`**: Loads fixture metadata. Pass it similarly.
- Main app viewer (`src/routes/video-viewer.tsx`) is out of scope — this is extension-side only for now.

### 5. Update dev-viewer E2E tests (`e2e/dev-viewer.spec.ts`)

Existing tests to update:

- `"strategy dropdown switches merge strategy"` — currently finds `select[title='Alignment strategy']` inline. After this change, the strategy select lives inside the dropdown menu. Update to open the `⋮` menu first, then interact with the alignment control.

New tests to add:

- **Settings menu opens/closes** — click `⋮` trigger, verify dropdown content is visible, click away to dismiss
- **Auto-scroll toggle via menu** — open menu, click auto-scroll item, verify state toggles (check title/aria attribute or localStorage)
- **Export downloads JSON** — open menu, click export, verify a download is triggered with valid JSON matching `importVideo` schema (use Playwright's `page.waitForEvent('download')`)

### 6. Verify

- `pnpm tsc && pnpm lint`
- `pnpm build`
- `pnpm test-e2e e2e/dev-viewer.spec.ts`
- Test extension manually: same dropdown works in shadow DOM context

## Status

- **Planning**: complete
- **Implementation**: complete
- **E2E tests**: all 10 passing
