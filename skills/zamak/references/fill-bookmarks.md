# Fill Bookmarks

The prompt carries the video title, the bookmarks to fill, and the captions in the same format as [Pick & Fill](pick-fill.md). Each bookmark has its `id`, its `text`, the `captionIndex` of its line, and that line's text.

Read the lines around each bookmark before filling it, because the sense, the Hanja, and any joke often depend on the scene rather than on that one line.

```json
{
  "type": "fill",
  "entries": [
    {
      "id": "abc-123",
      "translation": "to be confused",
      "etymology": "",
      "notes": ""
    }
  ]
}
```

- `id`: the bookmark's `id` from the prompt
- `translation`, `etymology`, `notes`: as [Vocab Fields](vocab-fields.md) describes

The app updates the bookmark with each `id`. These ids are local to the user's browser, so only the prompt carries them.
