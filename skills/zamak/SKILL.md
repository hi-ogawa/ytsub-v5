---
name: zamak
description: Work on Zamak, an app for learning Korean from YouTube subtitles. Use when a Zamak AI prompt arrives, when the user asks for one of its tasks (Pick & Fill, Fill Bookmarks, or Fix & Align ASR), or to read or change their Zamak videos and bookmarks.
---

# Zamak

Zamak is an app for learning Korean from YouTube videos. It shows a video's Korean and English captions side by side, one row per line, and the user bookmarks words in the rows to study. An AI fills in each bookmark's meaning and origin, and it can also fix the captions themselves.

The app hands a task to the AI through a prompt that the user copies from the caption panel's settings menu into a chat or an agent session. The prompt names the task, carries the video's data, and links to this skill, which describes the task. So the AI has to be able to open links. Links are relative to the file they appear in, so resolve them against the URL you read that file from.

## Tasks

Read the task's reference before you start. It has the steps, the data the prompt carries, and the result shape.

| Task                                           | What it does                                                   | Needs                              | Result `type` |
| ---------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- | ------------- |
| [Pick & Fill](references/pick-fill.md)         | Picks vocabulary from the captions and fills it in             | Any AI chat                        | `pick-fill`   |
| [Fill Bookmarks](references/fill-bookmarks.md) | Fills in the bookmarks the user made                           | Any AI chat                        | `fill`        |
| [Fix & Align ASR](references/fix-asr.md)       | Fixes auto-generated Korean and aligns it to an official track | An agent with a shell and `yt-dlp` | `fix-asr`     |

Each task returns one JSON object. The user pastes it into **Import AI result** in the same settings menu, and the app reads its `type` to tell which task it belongs to.

Run the task the user asks for. When they name a task without pasting its prompt, such as "pick fill next" after a fix-asr, read the data it needs as [Read the Current Rows](#read-the-current-rows) describes.

## Read the Current Rows

A task without its prompt reads the video from the server with `videos/getFullSession`, as [Use the Server API](references/server-api.md) describes. Each caption's `idx` is its `captionIndex`. The server has the user's latest rows only after they push, so ask them to push first. After a fix-asr, for example, the new rows reach the server only once the user imports the result and pushes.

The server's bookmark ids differ from the app's, so a Fill Bookmarks result built from them doesn't import in the app. Apply it through the server API with `bookmarks/updateBookmark` instead, and tell the user to pull when you are done.
