# Import via File Upload

## Problem

The ytsub agent skill (SKILL.md) currently includes a final step that calls the app's `importVideo` API directly via `curl`. This couples the skill to a running dev server and embeds API knowledge (oRPC envelope, endpoint URLs) into the skill doc.

**Goal:** Make `import.json` the skill's final deliverable, and add a file upload UI to the app so users can import at their own pace.

## Approach

Three parts:

1. **Normalize SKILL.md artifacts** — Align intermediate file schemas to match `import.json` format, remove API-calling concerns
2. **App: import file upload** — Add UI to upload `import.json` and call `importVideo` internally
3. **E2E test** — Verify the upload flow end-to-end

## Part 1: SKILL.md Changes

File: `docs/skills/ytsub/SKILL.md`

### Normalize intermediate artifacts

Currently the intermediate files use different field names than `import.json`, requiring a transformation in Step 4. Align them so assembly is a trivial merge:

**`video.json`** — Add `language1`/`language2` at fetch time (Step 1):

- yt-dlp `--print` template already produces the other fields; add `"language1":"ko","language2":"en"` (agent determines languages from available subs)
- No longer injected during Step 4 assembly

**`captions.json`** — Use `text1`/`text2` instead of `ko`/`en` (Step 2):

- Output format changes from `{idx, begin, end, ko, en}` to `{idx, begin, end, text1, text2}`
- Aligns with the `importVideo` schema directly
- Update the output format example and review instructions accordingly

**Step 4** — With normalized intermediates, assembly becomes:

```bash
jq -n --slurpfile c captions.json --slurpfile b bookmarks.json \
  '{video: input, captions: $c[], bookmarks: $b[]}' video.json > import.json
```

### Remove API concerns

- Update frontmatter `description` — remove "then import to ytsub via API"
- Update intro line similarly
- Remove **Config** section (lines 45-57)
- Remove **Error handling** section (lines 59-66) — API/network errors not relevant to a file-producing skill. Subtitle fetch errors are already covered inline in Step 1.
- **Step 4** — Remove the `POST` / curl section. Rename to "Assemble import.json". Add note: "Hand `import.json` to the user. They import via the app's upload UI."
- Remove **API reference** section (lines 282-295)

## Part 2: App — Import File Upload

### Design

Add an "Import" button to the video list page header. Clicking opens a dialog with:

1. File picker (accepts `.json`)
2. Preview summary (video title, caption count, bookmark count)
3. "Import" button to confirm

On confirm, parse JSON client-side, validate shape, call `orpc.videos.importVideo.mutate()`, then navigate to the imported video.

### Reference files

- `src/routes/video-list.tsx` — video list page (add Import button here)
- `src/server/routes/videos.ts:127-235` — `importVideo` procedure (input schema to validate against)
- `src/rpc.ts` — oRPC client
- `src/routes/login.tsx` — existing form/mutation pattern

### Implementation steps

1. **Import dialog component** in `src/routes/video-list.tsx` (keep colocated)
   - `<input type="file" accept=".json">` with drag-drop zone
   - `FileReader` to read file as text, `JSON.parse`
   - Basic client-side validation: check `video`, `captions`, `bookmarks` keys exist
   - Preview: show video title, caption count, bookmark count
   - Confirm button calls `importVideo` mutation
   - On success: invalidate video list query, close dialog, navigate to `/videos/{id}`
   - On error: show error message in dialog

2. **Trim SKILL.md** per Part 1

3. **E2E test** — New spec `e2e/import.spec.ts`

4. **Update prd.md** — Add task entry, move to Done when complete

## Part 3: E2E Test

File: `e2e/import.spec.ts`

### Test fixture

Use `scripts/db-seed-json/7GU_VQfgMT0/import.json` as the test fixture — it's a real skill output already committed to the repo.

### Reference

- `e2e/helper.ts` — `setupDb()` (clean DB, no seed), `login(page)`
- `e2e/basic.spec.ts` — existing patterns for login, navigation, assertions
- Playwright `page.setInputFiles()` for file upload

### Test cases

```
describe("import file upload")
  beforeAll: setupDb() (clean, no seed)
  beforeEach: login(page)

  test("import dialog opens and shows file picker")
    - click Import button on video list
    - dialog visible with file input

  test("uploading import.json shows preview and imports successfully")
    - open dialog
    - setInputFiles with fixture import.json
    - verify preview shows video title, caption count, bookmark count
    - click Import/confirm button
    - verify navigated to /videos/:id
    - verify caption rows visible in viewer

  test("imported video appears in video list")
    - navigate to /
    - verify video card with fixture title is visible
```

## Status

- [x] Plan created, awaiting feedback
- [x] Part 1: SKILL.md trimmed
- [x] Part 2: Import file upload UI
- [x] Part 3: E2E test
- [x] prd.md updated
