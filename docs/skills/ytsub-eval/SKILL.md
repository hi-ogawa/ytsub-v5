# ytsub-eval skill

Run the `ytsub` skill against test videos and verify output quality.

## File structure

```
ytsub-eval/
  SKILL.md              # this file
ytsub/
  SKILL.md              # skill under test
  scripts/              # helper scripts
  data/<id>/            # output artifacts to verify
```

## Test videos

Each video covers a different subtitle scenario. Add more as edge cases are discovered.

| Video ID      | Scenario        | Ko subs | En subs        | Notes                    |
| ------------- | --------------- | ------- | -------------- | ------------------------ |
| `7GU_VQfgMT0` | A: Both manual  | manual  | manual         | Billlie, song, seed data |
| `E8KM2qWSUS0` | B: Ko auto + En | auto    | manual         | tripleS, variety show    |
| `DtK-CkwNHSY` | B: Ko auto + En | auto    | manual (en-US) | tripleS, en-US variant   |

TODO: add videos for scenario C (ko manual only) and D (ko auto only).

## Procedure

1. Pick a test video from the table above
2. Run the `ytsub` skill against it (use subagent or manual invocation)
3. Run the quality checks below against the output in `ytsub/data/<id>/`
4. Record results in the eval log

## Quality checks

### Automated (programmatic)

| Check                   | How                                         | Pass criteria                 |
| ----------------------- | ------------------------------------------- | ----------------------------- |
| video.json valid        | Has youtubeId, title, channelName, duration | All fields present, non-empty |
| captions.json parseable | Valid JSON array                            | Parses without error          |
| No empty captions       | Every entry has non-empty `ko`              | Zero empty ko fields          |
| No garbled markers      | No `>>` in ko text                          | Zero matches                  |
| Bookmark offsets valid  | Run `validate-bookmarks.ts`                 | Zero errors                   |
| import.json valid       | Has video, captions[], bookmarks[]          | Correct shape                 |
| API import succeeds     | POST to importVideo                         | 200 response                  |

### Manual (LLM judgment)

| Check              | What to verify                                                   |
| ------------------ | ---------------------------------------------------------------- |
| Ko text quality    | Korean text reads naturally, no obvious speech-to-text artifacts |
| Ko/En alignment    | Spot-check 5-10 pairs — translations correspond to Korean        |
| Bookmark relevance | Vocab is genuinely intermediate+ and interesting                 |
| Bookmark count     | 10-20 per video                                                  |

## Eval log

Record results here. Append new entries at the top.

```
2026-03-05 | E8KM2qWSUS0 | Scenario B (ko auto + en manual) | 11/11 PASS
  Captions: 286 pairs, Korean text natural, alignment good
  Bookmarks: 15 (target 10-20), offsets valid, relevance good
  Minor issue: idx 163 냥→"Woof" (source subtitle error, not processing)
  Cost: 109k tokens, 24 tool calls, ~7 min
```
