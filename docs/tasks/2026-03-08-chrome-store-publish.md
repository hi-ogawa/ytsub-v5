# Publish Extension to Chrome Web Store

## Problem

The extension works locally via "Load unpacked" but isn't published to the Chrome Web Store yet. The `release chrome store` item in `docs/prd.md` tracks this.

## Current State

- Extension builds to `dist/extension/` via `pnpm build-ext` (Vite IIFE bundle)
- Manifest V3 with `activeTab` + `storage` permissions
- Content script runs on `https://www.youtube.com/*` in MAIN world
- No extension icons (missing from manifest and repo)
- Build renames to `ytsub-dev` in non-CI builds (CI keeps `ytsub`)
- No `.zip` packaging step exists yet

## What Chrome Web Store Requires

### Developer Account

- One-time $5 registration at https://chrome.google.com/webstore/devconsole
- Need to decide which Google account to register under

### Store Listing Assets

- **Extension icons** (required): 16x16, 48x48, 128x128 PNG
- **Store icon**: 128x128 PNG (shown in store listing)
- **Screenshots**: at least 1 screenshot, 1280x800 or 640x400
- **Description**: detailed store description (longer than manifest description)
- **Category**: select from Chrome Web Store categories

### Manifest Updates

Current manifest is minimal. Needs:

```jsonc
{
  // add icons
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
}
```

### Packaged `.zip`

Chrome Web Store accepts a `.zip` of the extension directory. Need a script to:

1. Run `pnpm build-ext` (CI mode so name stays `ytsub`)
2. Zip `dist/extension/` contents

## Implementation Steps

### 1. Create extension icons

- Design or generate simple icon (e.g. stylized "YS" or subtitle icon)
- Export at 16, 48, 128px sizes as PNG
- Place in `src/extension/icons/`

### 2. Update manifest.json

- Add `icons` field pointing to the icon files
- Review `description` — make it more descriptive for store listing

### 3. Update build to copy icons

- Update `vite.ext.config.ts` copy-manifest plugin (or add new plugin) to copy icon files to `dist/extension/icons/`

### 4. Add zip packaging script

- Add `package.json` script: `"zip-ext": "cd dist/extension && zip -r ../extension.zip ."`
- Or use a small node script if cross-platform needed

### 5. Prepare store listing

- Write store description
- Take screenshots of the extension in action on YouTube
- Choose category (probably "Productivity" or "Education")

### 6. Submit to Chrome Web Store

- Register developer account (if not already)
- Upload `.zip` via Chrome Web Store Developer Dashboard
- Fill in listing details, screenshots, description
- Submit for review (typically 1-3 business days)

### 7. CI automation (optional, later)

- GitHub Action to build + zip on tag/release
- Auto-publish via Chrome Web Store API (`chrome-webstore-upload` npm package)

## Reference

- Chrome Web Store docs: https://developer.chrome.com/docs/webstore/publish
- `chrome-webstore-upload` for CI: https://github.com/nicedoc/chrome-webstore-upload

## Status

- **Not started** — task doc created, awaiting feedback on approach
