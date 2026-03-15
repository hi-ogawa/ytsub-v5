# Video Viewer Settings Dropdown

## Problem

When `sessionOnly` is true (web app video-viewer), the entire header bar is hidden (`{!sessionOnly && ...}`). This hides the settings dropdown along with the track picker, so users lose access to auto-scroll toggle, sync status, AI prompt, etc.

## Design Decisions

### Track picker: read-only label (not interactive)

Track switching requires `fetchJson3` (fetches from YouTube), which isn't available in web viewer (captions come from IndexedDB). Show a plain text label like `ko · en` instead of disabled `<select>` elements.

### Settings dropdown placement: responsive

Desktop extension shows header row (TrackPicker + ⋮) above tab bar. Web viewer should mirror that structure on desktop for consistency — extension and web app are used in the same browser.

On mobile, the extension doesn't run, so we collapse into the tab bar to save vertical space.

**Desktop (lg:)**

```
┌─────────────────────────────────┐
│  ko · en                    [⋮] │  ← header row (mirrors extension)
├─────────────────────────────────┤
│ [Captions] [Bookmarks (3)] [◀▶]│  ← tab bar
```

**Mobile**

```
┌─────────────────────────────────┐
│ [Captions] [Bookmarks (3)] [◀▶] [⋮] │  ← single row
```

### Implementation: render SettingsDropdown twice with responsive visibility

- Header row: `hidden lg:flex` — visible on desktop only
- Tab bar slot: `lg:hidden` — visible on mobile only
- Same component, no state to sync (dropdown is stateless)

### Settings dropdown items for `sessionOnly`

- Sync status (SyncMenuItem)
- Auto-scroll toggle
- ~~Track alignment~~ (hidden — no track switching)
- AI Prompt Copy
- Import AI result
- Export import.json
- Clear bookmarks

## Reference Files

- `src/components/caption-panel.tsx` — main changes (CaptionPanelInner, SettingsDropdown, CaptionPanelContent)
- `src/routes/video-viewer.tsx` — passes `sessionOnly` + `sync`

## Implementation Steps

1. Add `sessionOnly` prop to `SettingsDropdown` — hide "Track alignment" when true
2. In `CaptionPanelInner`: when `sessionOnly`, render header row with track label + `SettingsDropdown` (desktop only via `hidden lg:flex`)
3. Pass settings slot props through to `CaptionPanelContent`
4. In `CaptionPanelContent` tab bar: render `SettingsDropdown` in `ml-auto` area (mobile only via `lg:hidden`)
5. Verify with `pnpm build`

## Status

- [ ] Implementation
- [ ] Build passes
- [ ] PR created
