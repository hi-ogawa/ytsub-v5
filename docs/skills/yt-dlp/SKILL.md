---
name: yt-dlp
description: >-
  Sync YouTube API workarounds from yt-dlp source. Check upstream for updated
  client configs, POT handling, and subtitle fetching logic.
---

# yt-dlp skill

Keep our YouTube extraction logic (`src/lib/youtube.ts`) in sync with yt-dlp's workarounds. YouTube regularly rotates anti-bot measures; yt-dlp tracks and adapts to these changes.

## Why this exists

Our extension fetches YouTube subtitles by spoofing mobile client headers (iOS/Android) via the `youtubei/v1/player` API. This trick is copied from yt-dlp. When YouTube breaks it, yt-dlp finds a new workaround — we need to follow.

## File structure

```
./
├── SKILL.md                          # this file
├── .gitignore                        # ignores references/
└── references/                       # gitignored
    └── yt-dlp/                       # shallow clone of yt-dlp/yt-dlp
        └── yt_dlp/extractor/youtube/
            ├── _base.py              # client configs, innertube context, POT defs
            ├── _video.py             # caption extraction, player response parsing
            └── pot/
                ├── _director.py      # POT token acquisition flow
                └── _provider.py      # POT provider interface
```

## Reference material

The yt-dlp source is available locally at `references/yt-dlp/` (gitignored). If missing, clone it:

```sh
git clone --depth 1 https://github.com/yt-dlp/yt-dlp.git references/yt-dlp
```

## What to check

### 1. Client configs

In `_base.py`, find `INNERTUBE_CLIENTS` dict. Each client has:

- `INNERTUBE_CONTEXT` — `clientName`, `clientVersion`, `deviceModel`, `userAgent`, `osVersion`
- `INNERTUBE_HOST` — API host
- `REQUIRE_JS_PLAYER` — whether it needs JS player for signature decryption
- POT policies — `PLAYER_PO_TOKEN_POLICY`, `GVS_PO_TOKEN_POLICY`, `SUBS_PO_TOKEN_POLICY`

**Clients we care about** (no JS player required):

| Client       | clientName   | Why                              |
| ------------ | ------------ | -------------------------------- |
| `ios`        | `IOS`        | Currently used in our code       |
| `android`    | `ANDROID`    | Alternative mobile client        |
| `android_vr` | `ANDROID_VR` | yt-dlp's current primary default |

**What to update in our code:** `clientName`, `clientVersion`, `userAgent`, `deviceModel`, `osVersion`, `signatureTimestamp` in `fetchPlayerApi()`.

### 2. Default client priority

In `_base.py`, find `_DEFAULT_CLIENTS`:

```python
_DEFAULT_CLIENTS = ('android_vr', 'web', 'web_safari')
```

If the default changes, consider switching our client accordingly.

### 3. POT (Proof of Origin Token) handling

Three POT contexts:

| Context  | Where attached                                    | What it protects            |
| -------- | ------------------------------------------------- | --------------------------- |
| `PLAYER` | Request body `serviceIntegrityDimensions.poToken` | `/youtubei/v1/player` calls |
| `GVS`    | Stream URL query params                           | Video/audio streams         |
| `SUBS`   | Subtitle URL: `&pot=TOKEN&potc=1&c=CLIENT_NAME`   | `/api/timedtext` calls      |

Each client has a policy per context (`required`, `recommended`, `not_required_for_premium`).

**Key check:** If our client's `SUBS_PO_TOKEN_POLICY.required` becomes `True`, subtitle fetching will break and we need a new approach.

**POT detection in subtitle URLs:** yt-dlp checks for `xpe` or `xpv` in the `exp` query param of caption `baseUrl` to detect whether POT is required.

### 4. Subtitle URL construction

In `_video.py`, find `process_language()`:

```python
query = {**pot_params, 'fmt': fmt, 'xosf': []}
url = urljoin('https://www.youtube.com', update_url_query(base_url, query))
```

- `pot_params` = `{'pot': token, 'potc': '1', 'c': innertube_client_name}` (if POT required)
- `xosf=[]` removes the param (avoids text positioning data)
- `fmt` options: `json3`, `srv1`, `srv2`, `srv3`, `ttml`, `srt`, `vtt`

### 5. Visitor data extraction

In `_base.py`, find `_extract_visitor_data()`:

1. Config arg `visitor_data`
2. `ytcfg.VISITOR_DATA`
3. `ytcfg.INNERTUBE_CONTEXT.client.visitorData`
4. `responseContext.visitorData`

## Workflow

1. Pull latest yt-dlp source:
   ```sh
   cd docs/skills/yt-dlp/references/yt-dlp && git pull
   ```
2. Check client configs in `_base.py` → compare with our `fetchPlayerApi()` in `src/lib/youtube.ts`
3. Check POT policies → verify our client doesn't newly require SUBS POT
4. Check default client priority → consider switching if `ios` is deprioritized
5. Update our code if needed, run `pnpm test-youtube` to verify

## Current state (as of 2026-03-08)

**Our code uses** (synced with yt-dlp):

- Default client: `ANDROID_VR` v`1.71.26` (yt-dlp's default, simplest — no POT policies)
- Fallback client: `IOS` v`21.02.3`
- Both tested and working via Playwright (`pnpm test-youtube`)
- No `signatureTimestamp` needed (mobile clients don't require JS player)
