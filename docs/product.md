# Product Overview

Zamak turns YouTube videos into vocabulary study. This doc explains the problem it solves and how a learner uses it. [Architecture overview](architecture.md) explains how it's built.

## Turn Watching Into Active Learning

YouTube has endless native content for a language learner. But watching alone is passive, so the words you meet slip away. To learn from a video, you need to pull out the words worth knowing, understand them, and come back to them later.

Zamak was built for learning Korean. The caption panel works with any language that has captions, but the AI prompts ask for Korean vocabulary and its etymology.

Existing tools mostly help one word at a time. Language Reactor and similar extensions show dual subtitles and translate a word when you click it. None of them pick out the useful vocabulary in a whole video and explain it in depth. An LLM is good at exactly that, so Zamak builds its workflow around one.

Zamak is the fifth version of this project. Earlier versions stopped working when YouTube restricted its APIs (v3) or when the extension grew too complex to maintain (v4). [References](references.md) covers the earlier versions and similar tools.

## Study a Video in Four Steps

1. **Watch** a video with two caption tracks side by side, usually the language you're learning and a translation. The panel lines the two tracks up and follows playback.
2. **Bookmark** words and phrases by selecting them in a caption. Or skip this step and let the LLM pick the interesting vocabulary for you.
3. **Fill with an LLM.** Zamak builds a prompt with the captions and your bookmarks in it. You paste it into any LLM chat, such as Claude, ChatGPT, or Gemini, and paste the JSON answer back. The LLM adds a translation, the etymology, and usage notes to each bookmark. It can also fix errors in auto-generated captions.
4. **Review** your bookmarks in the panel's bookmark list. Each bookmark keeps the caption it came from, and you can jump back to that moment in the video.

The LLM step works through the clipboard on purpose. It works with any model and any chat app, you can read the whole prompt before you send it, and Zamak needs no API key and no AI service of its own. [AI integration](ai-integration.md) walks through the steps.

## Start in the Extension, Continue Anywhere

1. **Install the extension and open a YouTube video.** A button on the video page opens the caption panel.
2. **Bookmark from the captions.** Captions and bookmarks are saved in the browser, so you don't need an account.
3. **Click the extension's icon** to open the bookmarks page, which lists every video you've studied. A card takes you back to the video on YouTube.

## Add an Account and the Web App When You Need Them

Each setup adds to the one before it:

| Setup                         | What you get                                                                                                                                                                                 | What it needs    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Extension only                | Study, bookmarks, the AI workflow, and the bookmarks page, all saved in the browser                                                                                                          | Nothing          |
| Extension + account           | Push a video to the server or pull it back, one video at a time, to back it up or move it to another browser with the extension. The bookmarks page shows which videos need a push or a pull | A sign-in        |
| Extension + account + web app | Review synced videos with their captions and bookmarks on a device without the extension, such as a phone                                                                                    | The same sign-in |

The web app can't fetch new videos from YouTube. It only shows videos you pushed, or ones you import from an `import.json` file, which the caption panel exports or [Generate import.json](generate-import-json.md) builds with yt-dlp and an LLM.
