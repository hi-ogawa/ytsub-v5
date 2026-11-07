# Anki Integration

## Problem

Zamak bookmarks contain rich vocabulary data (word, translation, etymology, usage notes, caption context, video timestamp) but there's no path to spaced repetition review. Anki is the dominant SRS tool for language learners.

## Research: How others integrate with Anki

### Language Reactor

- **Method:** CSV/TSV file export → manual Anki import
- **Card contents:** Saved word, context sentence from subtitle, translation
- **UX:** Widely criticized as clunky — requires manual file handling, note type configuration
- **Takeaway:** File export is the minimum viable approach but users dislike it
- Sources: [Language Reactor export help](https://www.languagereactor.com/help/export), [forum guide](https://forum.languagelearningwithnetflix.com/t/how-to-export-guide/19596)

### Yomitan (successor to Yomichan)

- **Method:** Real-time push via AnkiConnect (one-click "+" button)
- **Card contents:** Configurable via template markers — expression, reading, glossary, context sentence, audio, screenshot
- **UX:** Gold standard — hover word → popup → click "+" → card created instantly
- **Takeaway:** AnkiConnect push is the de facto standard for browser-to-Anki integration
- Sources: [Yomitan Anki docs](https://yomitan.wiki/anki/)

### asbplayer

- **Method:** Real-time push via AnkiConnect
- **Card contents:** Sentence (from subtitle), screenshot (video frame), audio clip (extracted from time range), word, definition
- **UX:** Ctrl+Shift+X opens card creator dialog with time range slider for audio/screenshot
- **Takeaway:** Rich media capture at creation time, simple cards at review time
- Sources: [asbplayer mining guide](https://docs.asbplayer.dev/docs/guides/mining-in-depth/), [mining subtitles](https://docs.asbplayer.dev/docs/getting-started/mining-subtitles/)

### Migaku

- **Method:** Custom Anki add-on (proprietary, not AnkiConnect)
- **Card contents:** Screenshot, audio snippet, context sentence, ChatGPT-generated explanations
- **UX:** Click word in subtitles → "Create card" → auto-captures media → pushes to Anki
- **Takeaway:** Tightest integration but requires subscription + proprietary add-on
- Sources: [Migaku card creator](https://migaku.com/blog/youtube/the-card-creator-migaku-browser-extension), [Migaku + Anki](https://lingoly.io/connect-migaku-with-anki/)

### Summary

| Tool             | Method             | UX quality | Friction                              |
| ---------------- | ------------------ | ---------- | ------------------------------------- |
| Language Reactor | CSV export         | Poor       | High — manual import cycle            |
| Yomitan          | AnkiConnect push   | Excellent  | Low — one-click, Anki must be running |
| asbplayer        | AnkiConnect push   | Excellent  | Low — rich card creator dialog        |
| Migaku           | Custom Anki add-on | Excellent  | Medium — proprietary, subscription    |

## Research: AnkiConnect

Anki desktop add-on (code `2055492159`) that runs an HTTP server on `localhost:8765`.

**Key API actions:**

- `addNote` / `addNotes` (batch) — create cards with fields, tags, audio, pictures
- `updateNoteFields` — update existing cards (enables sync)
- `findNotes` — query by field values (enables deduplication)
- `storeMediaFile` — store audio/images in Anki's media folder
- `modelNames` / `modelFieldNames` — discover note types for config UI
- `createDeck` — create deck if it doesn't exist
- `multi` — batch multiple operations in one request

**Media support:** Audio/images can be sent inline via base64 `data`, `url`, or local `path`.

**CORS:** Extensions must be listed in `webCorsOriginList` config (e.g., `"chrome-extension://your-extension-id"`). One-time setup friction.

**Limitations:**

- Anki desktop must be running (no mobile, no headless)
- Localhost only by default
- No push notifications (fire-and-forget from extension side)
- CORS setup is a common stumbling block for users

Sources: [AnkiConnect GitHub](https://github.com/amikey/anki-connect), [AnkiConnect on AnkiWeb](https://ankiweb.net/shared/info/2055492159), [API reference](https://deepwiki.com/amikey/anki-connect/2.2-api-reference), [CORS issues](https://github.com/FooSoft/anki-connect/issues/130)

## Research: Anki card rendering

Cards are HTML/CSS/JS templates with Mustache-like field substitution (`{{FieldName}}`). Rendered in a webview.

### Platform capabilities

| Feature         | Desktop (Qt6) | AnkiDroid                                                                         | AnkiMobile (iOS) | AnkiWeb          |
| --------------- | ------------- | --------------------------------------------------------------------------------- | ---------------- | ---------------- |
| Arbitrary JS    | Full          | Good (has JS API)                                                                 | Fragile          | Good (no bridge) |
| YouTube iframe  | Works         | Broken                                                                            | Broken           | Works            |
| HTML5 `<video>` | With add-on   | Partial                                                                           | Unreliable       | Works            |
| Custom JS UI    | Full          | Good                                                                              | Fragile          | Good             |
| Bridge to host  | `pycmd()`     | [JS API](https://github.com/ankidroid/Anki-Android/wiki/AnkiDroid-Javascript-API) | None             | None             |

**Key insight:** Mobile is the bottleneck. YouTube iframes and complex JS break on mobile clients. All competitors (Migaku, asbplayer) extract static screenshot + audio clip at creation time rather than embedding players in review cards.

**Underscore-prefixed files** (e.g., `_player.js`, `_style.css`) in `collection.media` are preserved during media checks and included in deck exports — this is how custom JS/CSS is bundled with note types.

Sources: [Anki card templates](https://docs.ankiweb.net/templates/intro.html), [field replacements](https://docs.ankiweb.net/templates/fields.html), [styling & HTML](https://docs.ankiweb.net/templates/styling.html), [external files guide](https://forums.ankiweb.net/t/how-to-include-external-files-in-your-template-js-css-etc-guide/11719), [JS compatibility](https://forums.ankiweb.net/t/javascript-compatibility/20623), [iframe in cards](https://forums.ankiweb.net/t/iframe-usage-within-anki-cards/317), [embedded videos](https://forums.ankiweb.net/t/embedded-videos/44325)

## Research: Anki add-on development

- **Language:** Python (Anki is Python/Qt)
- **Structure:** Python packages in `addons21/` directory, entry point `__init__.py`
- **Access:** Full access to Anki internals (`anki` module for collection/notes/media, `aqt` module for Qt UI)
- **Distribution:** Via [ankiweb.net/shared](https://ankiweb.net/shared) with a numeric code
- **Desktop only** — add-ons don't run on AnkiDroid, AnkiMobile, or AnkiWeb

**Patterns for receiving external data:**

1. **HTTP server** (AnkiConnect model) — add-on starts localhost server, external apps POST to it
2. **File watcher** — add-on watches a directory for new JSON/CSV files

Sources: [Anki add-on docs](https://addon-docs.ankiweb.net/), [Python modules](https://addon-docs.ankiweb.net/python-modules.html)

## Zamak's advantage

Zamak bookmarks already contain richer data than any competitor's cards:

- Word/phrase with exact caption position
- Full caption sentence context (both languages)
- AI-filled translation, etymology, usage notes
- Video metadata + timestamp for the exact moment

## Open questions

- Where does the user primarily review? (Desktop vs mobile — shapes the whole approach)
- Export scope: per-video, bulk, or incremental?
- Card format: front/back layout, which fields?
- Audio/screenshot capture: worth the complexity?
- One-way export vs bidirectional sync?
- Custom Anki add-on: worth building or overkill?

## Status

- [x] Research: competitor integrations
- [x] Research: AnkiConnect API
- [x] Research: card rendering capabilities
- [x] Research: add-on development model
- [ ] Design: decide integration approach
- [ ] Design: card template
- [ ] Implementation
