# Skill integration notes

Notes for authoring the agent skill that feeds data into the ytsub app.

## LLM capabilities beyond vocab extraction

### Auto-caption correction

Korean auto-captions are often wrong. LLM can:

- Correct mistranscribed Korean from context
- Infer intended words from surrounding sentences

### Single-sub → dual-sub

App doesn't need dual subtitle tracks from YouTube. Given one track:

- Korean auto-sub only → LLM corrects Korean + generates English translation
- This means most Korean YouTube content is usable (auto-subs are common)

### Cross-reference with manual subs

When manual subs exist in other languages (English, Japanese, Chinese are common):

- LLM can cross-reference to improve Korean correction
- Align timing between tracks that may have different cue boundaries
- Use the manual sub as a reference to disambiguate auto-caption errors

## Skill pipeline (sketch)

```
Input: YouTube URL
  1. yt-dlp: fetch available subtitle tracks
  2. yt-dlp: download Korean sub (auto or manual) + any manual subs available
  3. LLM: correct Korean if auto-generated (cross-ref with manual subs if available)
  4. LLM: generate English translation if no English sub
  5. LLM: extract notable vocab with timestamps
  6. POST /api/videos: push video + corrected captions
  7. POST /api/bookmarks: push extracted vocab (bulk)
```

## TODO

- [ ] Author skill for clawdbot that implements the above pipeline
- [ ] Define API contract (what the skill POSTs to the app)
- [ ] Handle edge cases: no subs at all, multiple Korean tracks (auto vs manual)
