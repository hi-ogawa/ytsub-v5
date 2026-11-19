# Use the Server API

This guide is for scripts and agents that read or change a user's videos and bookmarks on the server, such as applying an AI result without pasting it into the app. The procedures are in `src/server/routes/`.

## Call a Procedure

The API is oRPC. Each procedure is a POST to `https://zamak.hiro18181.workers.dev/api/<router>/<procedure>`, with the input wrapped in `json`. The result comes back wrapped in `json` too.

```bash
curl -s -X POST https://zamak.hiro18181.workers.dev/api/videos/getFullSession \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"json": {"youtubeId": "iPBMBwYAyw4"}}' | jq .json
```

List procedures such as `videos/listVideos` return `{ items, total }` and take `limit` (default 20) and `offset`.

## Log In

Call `auth/login` with `{ "username", "password" }`. The result carries a `token`, which you send as `Authorization: Bearer <token>`. A token lasts 30 days.

```bash
TOKEN=$(curl -s -X POST https://zamak.hiro18181.workers.dev/api/auth/login \
  -H "content-type: application/json" \
  -d "$(jq -n --arg u "$USERNAME" --arg p "$PASSWORD" '{json: {username: $u, password: $p}}')" \
  | jq -r .json.token)
```

The response also sets a `session` cookie with the same token, but URL-encoded. Use the token from the body, because the encoded cookie value gets a 401 as a bearer token.

## Edit a Video's Captions and Bookmarks

1. Read the video with `videos/getFullSession { youtubeId }`. It returns `{ video, captions, bookmarks }`, or `null` when the server doesn't have the video. A bookmark points at its row by `captionId`, the row's server id, and a row's position is its `idx`.
2. Fix a row with `videos/updateCaption { videoId, idx, text1?, text2? }`.
3. Change bookmarks by their server `id`:
   - `bookmarks/updateBookmark { id, text?, offset?, context?, translation?, etymology?, notes? }`
   - `bookmarks/createBookmarks { bookmarks: [{ videoId, captionId, text, side, offset, ... }] }`
   - `bookmarks/deleteBookmark { id }`

Use these for small fixes, such as one misheard line and the bookmark on its word, rather than rewriting the whole video with `importVideo`. They leave every other row and bookmark untouched.

`updateCaption` doesn't move the row's bookmarks. When a fix changes a bookmarked word or shifts its position, follow it with `updateBookmark`, setting `text` and `offset` to where the word now sits and `context` to the new row text. The server rejects a `text` that isn't at `offset` in the row's `text1`, or `text2` for a side 1 bookmark, so fix the row first. It also rejects `text` and `offset` changes on a bookmark whose `captionId` is null, because its row was deleted.

Take the ids from `getFullSession`, not from an AI prompt the app copied. The app's ids are local, and the server recreates its bookmarks under new ids on every push, so the two rarely match. Match the AI result to the server's bookmarks by `text` and row instead.

## Replace or Create a Video

To replace all of a video's captions, such as after a Fix ASR pass over the whole video, call `videos/importVideo` with the whole video. It takes the same `{ video, captions, bookmarks }` shape as [`import.json`](generate-import-json.md), and it replaces all of the video's captions and bookmarks. When the server doesn't have the video, `importVideo` creates it, so a new video doesn't need a push from the app first.

Its `video` also needs `vssId1` and `vssId2`, the ids of the YouTube caption tracks that `text1` and `text2` come from. For a video on the server, copy them from `getFullSession`. For a new video, take the ids of the tracks you built the rows from, as [Find Each Track's vssId](generate-import-json.md#find-each-tracks-vssid) describes. The app looks a track up by its exact id, so it can't match a guessed id to any of the video's tracks.

Set `language1` and `language2` to the language code at the end of each id, such as `en-US` for `.en-US`, because the app derives them that way when it saves the video.

## Keep the Server's Copy Current

The app keeps sessions in the browser and syncs them with the server one whole video at a time. A change on the server marks the video as changed there, and the user then pulls it, which replaces their local copy. So before you edit a video, make sure the user has pushed their latest local changes, because a pull drops anything that never reached the server.
