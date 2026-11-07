# YouTube Subtitle Fetching

The extension fetches YouTube subtitles by spoofing mobile client headers (iOS, Android) on the `youtubei/v1/player` API. The trick comes from [yt-dlp](https://github.com/yt-dlp/yt-dlp). YouTube regularly rotates its anti-bot measures, and yt-dlp tracks and adapts to those changes. When YouTube breaks our fetching, yt-dlp usually has the new workaround already, so we follow it.

## Read the Workarounds From yt-dlp's Source

The relevant code lives under [`yt_dlp/extractor/youtube/`](https://github.com/yt-dlp/yt-dlp/tree/master/yt_dlp/extractor/youtube):

```
yt_dlp/extractor/youtube/
├── _base.py              # client configs, innertube context, POT defs
├── _video.py             # caption extraction, player response parsing
└── pot/
    ├── _director.py      # POT token acquisition flow
    └── _provider.py      # POT provider interface
```

A shallow clone outside this repo is enough to read and grep it:

```sh
git clone --depth 1 https://github.com/yt-dlp/yt-dlp.git
```

## Pick a Client That Needs No JS Player

In `_base.py`, the `INNERTUBE_CLIENTS` dict defines each client:

- `INNERTUBE_CONTEXT`: `clientName`, `clientVersion`, `deviceModel`, `userAgent`, `osVersion`
- `INNERTUBE_HOST`: API host
- `REQUIRE_JS_PLAYER`: whether it needs the JS player for signature decryption
- POT policies: `PLAYER_PO_TOKEN_POLICY`, `GVS_PO_TOKEN_POLICY`, `SUBS_PO_TOKEN_POLICY`

We care about the clients that need no JS player:

| Client       | clientName   | Why                              |
| ------------ | ------------ | -------------------------------- |
| `ios`        | `IOS`        | Our fallback client              |
| `android`    | `ANDROID`    | Alternative mobile client        |
| `android_vr` | `ANDROID_VR` | yt-dlp's current primary default |

Our side of this is the client table in `fetchPlayerApi()` in `src/lib/youtube.ts`, which carries `clientName`, `clientVersion`, `userAgent`, `deviceModel`, and `osVersion` for each client.

yt-dlp's default client priority is `_DEFAULT_CLIENTS` in `_base.py`:

```python
_DEFAULT_CLIENTS = ('android_vr', 'web', 'web_safari')
```

If the default changes, consider switching our client accordingly.

## Avoid Proof of Origin Tokens

YouTube protects its endpoints with POT (Proof of Origin Token) in three contexts:

| Context  | Where attached                                    | What it protects            |
| -------- | ------------------------------------------------- | --------------------------- |
| `PLAYER` | Request body `serviceIntegrityDimensions.poToken` | `/youtubei/v1/player` calls |
| `GVS`    | Stream URL query params                           | Video/audio streams         |
| `SUBS`   | Subtitle URL: `&pot=TOKEN&potc=1&c=CLIENT_NAME`   | `/api/timedtext` calls      |

Each client has a policy per context (`required`, `recommended`, `not_required_for_premium`). Our approach works only while our client's `SUBS_PO_TOKEN_POLICY.required` is `False`. If it becomes `True`, subtitle fetching breaks and we need a new approach.

yt-dlp detects whether a caption `baseUrl` needs POT by checking for `xpe` or `xpv` in its `exp` query param.

## Build the Subtitle URL

In `_video.py`, `process_language()` builds the subtitle URL:

```python
query = {**pot_params, 'fmt': fmt, 'xosf': []}
url = urljoin('https://www.youtube.com', update_url_query(base_url, query))
```

- `pot_params` is `{'pot': token, 'potc': '1', 'c': innertube_client_name}` when POT is required
- `xosf=[]` removes the param, which avoids text positioning data
- `fmt` options are `json3`, `srv1`, `srv2`, `srv3`, `ttml`, `srt`, and `vtt`

## Extract Visitor Data

In `_base.py`, `_extract_visitor_data()` tries these sources in order:

1. Config arg `visitor_data`
2. `ytcfg.VISITOR_DATA`
3. `ytcfg.INNERTUBE_CONTEXT.client.visitorData`
4. `responseContext.visitorData`

## Check When YouTube Breaks Fetching

1. Pull the latest yt-dlp source.
2. Compare the client configs in `_base.py` with `fetchPlayerApi()` in `src/lib/youtube.ts`.
3. Check that our client doesn't newly require SUBS POT.
4. Check the default client priority, and consider switching if our client is deprioritized.
5. Update our code if needed, and run `pnpm test-youtube` to verify.
