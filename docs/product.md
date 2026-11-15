# Product Overview

Zamak turns YouTube videos into vocabulary study. This doc explains the problem it solves and how a learner uses it. [Architecture overview](architecture.md) explains how it's built.

## Turn Watching Into Active Learning

YouTube has endless native content for a language learner. Zamak was built for learning Korean, but it works with any language that has captions. Watching alone is passive, though, so the words you meet slip away. To learn from a video, you need to pull out the words worth knowing, understand them, and come back to them later.

Existing tools mostly help one word at a time. Language Reactor and similar extensions show dual subtitles and translate a word when you click it. None of them pick out the useful vocabulary in a whole video and explain it in depth. An LLM is good at exactly that, so Zamak builds its workflow around one.

Zamak is the fifth version of this project. Earlier versions stopped working when YouTube restricted its APIs (v3) or when the extension grew too complex to maintain (v4). [References](references.md) covers the earlier versions and similar tools.

## Study a Video in Four Steps

1. **Watch** a video with two caption tracks side by side, usually the language you're learning and a translation. The panel lines the two tracks up and follows playback.
2. **Bookmark** words and phrases by selecting them in a caption. Or skip this step and let the LLM pick the interesting vocabulary for you.
3. **Fill with an LLM.** Zamak builds a prompt with the captions and your bookmarks in it. You paste it into any LLM chat, such as Claude, ChatGPT, or Gemini, and paste the JSON answer back. The LLM adds a translation, the etymology, and usage notes to each bookmark. It can also fix errors in auto-generated captions.
4. **Review** your bookmarks in the panel's bookmark list. Each bookmark keeps the caption it came from, and you can jump back to that moment in the video.

The LLM step works through the clipboard on purpose. It works with any model and any chat app, you can read the whole prompt before you send it, and Zamak needs no API key and no AI service of its own. [AI integration](ai-integration.md) walks through the steps.

## Start in the Extension, Continue Anywhere

The Chrome extension is where you study. Once it's installed, a button appears on every YouTube video page, and it opens the caption panel. Your captions and bookmarks are saved in the browser, so you don't need an account. Clicking the extension's icon opens the bookmarks page, which lists every video you've studied. A card takes you back to the video on YouTube.

Signing in is optional. With an account, you can push a video to the server and pull it back on another browser, one video at a time. The bookmarks page shows which videos need a push or a pull.

The web app is for reviewing on devices without the extension, such as a phone. After you sign in, it lists your synced videos and shows each one with its captions and bookmarks next to the video. It can't add new videos, because only the extension can get subtitles from YouTube. The one other way in is an `import.json` file, which the caption panel can export and the web app can import.
