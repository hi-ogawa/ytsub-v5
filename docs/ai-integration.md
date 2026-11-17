# AI Integration

Zamak doesn't call any AI API directly. Instead it gives you a **copy-paste workflow** that works with any LLM — Claude, ChatGPT, Gemini, or anything else.

The flow: Zamak builds a prompt with your video's captions baked in → you paste it into an AI chat → you paste the AI's JSON response back into Zamak.

## Available tasks

| Task                | What it does                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Pick & Fill**     | AI scans captions and picks ~5–60 interesting Korean vocabulary words, returning translations and etymology |
| **Fill Bookmarks**  | You bookmark words first, then AI fills in translations and etymology for them                              |
| **Fix & Align ASR** | A coding agent fixes auto-generated Korean using the official tracks, and aligns it to the English          |

The first two work in any chat. Fix & Align ASR needs an agent with a shell and `yt-dlp`, such as Claude Code or Codex, because the agent downloads the tracks itself. Its prompt carries only the video ID, the tracks, and your bookmarks' positions, and points the agent to [Generate import.json](generate-import-json.md) for the steps.

## Step by step

### 1. Copy the prompt

Open the settings menu (gear icon) in the caption panel. Under **AI prompt**, pick a task from the dropdown.

The prompt is automatically copied to your clipboard when you select a task. You can also use the copy button or download it as a `.txt` file.

For Pick & Fill and Fill Bookmarks, the prompt contains the video title, all captions, and (for Fill Bookmarks) your existing bookmarks — everything the AI needs in one self-contained block.

### 2. Paste into any AI chat

Open your preferred LLM chat and paste the prompt. The prompt asks the AI to respond with one JSON code block, optionally with a short comment around it.

Any model that can follow instructions and output JSON works. Larger models tend to produce better vocabulary picks. For Fix & Align ASR, paste the prompt into an agent session instead.

> **Tip:** For long videos, the prompt can be large. If your model has a small context window, use the download button and attach the `.txt` file instead of pasting.

### 3. Import the result

Copy the AI's entire response. Zamak reads the first JSON code block and ignores any text around it.

Back in Zamak, open the settings menu and click **Import AI result**. Paste the JSON when prompted.

Zamak reads the result's `type` field to tell which task it belongs to, and applies it:

- **Pick & Fill** → creates new bookmarks with translations and etymology filled in
- **Fill Bookmarks** → updates your existing bookmarks with the AI-provided metadata
- **Fix & Align ASR** → replaces all caption rows and moves each bookmark to its word in the new rows, keeping its translation and notes. If any bookmark is missing from the result or doesn't match its row, Zamak lists the problems and imports nothing

A confirmation alert shows how many items were imported. For Pick & Fill, it also warns if any caption indices didn't match (e.g., if the AI hallucinated an index).

## Example

Here's what a Pick & Fill result looks like:

```json
{
  "type": "pick-fill",
  "entries": [
    {
      "captionIndex": 4,
      "text": "체중",
      "translation": "body weight",
      "etymology": "體重 / 体重",
      "notes": "몸무게 (.syn:native)"
    },
    {
      "captionIndex": 12,
      "text": "어이없다",
      "translation": "absurd, dumbfounded",
      "etymology": "",
      "notes": ""
    }
  ]
}
```

## Tips

- **Pick & Fill** is the most common starting point — it gives you a vocabulary list without any manual bookmarking first.
- **Fill Bookmarks** is useful when you've already highlighted specific words and just want metadata filled in.
- **Fix & Align ASR** is for videos whose Korean is auto-generated or machine-translated but which have an official English track. For a song, the agent takes the Korean from the official lyrics instead. The agent picks the tracks itself, so the tracks selected in the panel don't matter.
- You can run tasks multiple times on the same video. Pick & Fill creates new bookmarks each time; Fill updates in place.
