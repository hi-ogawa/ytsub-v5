# AI Integration

Zamak doesn't call any AI API directly. Instead it gives you a **copy-paste workflow** that works with any LLM — Claude, ChatGPT, Gemini, or anything else.

The flow: Zamak builds a prompt with your video's captions baked in → you paste it into an AI chat → you paste the AI's JSON response back into Zamak.

## Available tasks

| Task               | What it does                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Pick & Fill**    | AI scans captions and picks ~5–60 interesting Korean vocabulary words, returning translations and Hanja etymology |
| **Fill Bookmarks** | You bookmark words first, then AI fills in translations and etymology for them                                    |
| **Fix ASR**        | AI corrects errors in auto-generated Korean subtitles using the English captions as reference                     |

## Step by step

### 1. Copy the prompt

Open the settings menu (gear icon) in the caption panel. Under **AI prompt**, pick a task from the dropdown.

The prompt is automatically copied to your clipboard when you select a task. You can also use the copy button or download it as a `.txt` file.

The prompt contains the video title, all captions, and (for Fill Bookmarks) your existing bookmarks — everything the AI needs in one self-contained block.

### 2. Paste into any AI chat

Open your preferred LLM chat and paste the prompt. The prompt instructs the AI to respond with a JSON code block — no other formatting.

Any model that can follow instructions and output JSON works. Larger models tend to produce better vocabulary picks and more accurate ASR fixes.

> **Tip:** For long videos, the prompt can be large. If your model has a small context window, use the download button and attach the `.txt` file instead of pasting.

### 3. Import the result

Copy the AI's entire response (the JSON code block).

Back in Zamak, open the settings menu and click **Import AI result**. Paste the JSON when prompted.

Zamak auto-detects which task the result belongs to and applies it:

- **Pick & Fill** → creates new bookmarks with translations and etymology filled in
- **Fill Bookmarks** → updates your existing bookmarks with the AI-provided metadata
- **Fix ASR** → overwrites the corrected Korean caption lines

A confirmation alert shows how many items were imported. For Pick & Fill, it also warns if any caption indices didn't match (e.g., if the AI hallucinated an index).

## Example

Here's what a Pick & Fill result looks like:

```json
[
  {
    "captionIndex": 4,
    "text": "체중",
    "translation": "body weight",
    "etymology": "體重"
  },
  {
    "captionIndex": 12,
    "text": "어이없다",
    "translation": "absurd, dumbfounded",
    "etymology": ""
  }
]
```

## Tips

- **Pick & Fill** is the most common starting point — it gives you a vocabulary list without any manual bookmarking first.
- **Fill Bookmarks** is useful when you've already highlighted specific words and just want metadata filled in.
- **Fix ASR** works best on auto-generated subtitles (not manually written ones). The English captions serve as the ground truth.
- You can run tasks multiple times on the same video. Pick & Fill creates new bookmarks each time; Fill and Fix ASR update in place.
