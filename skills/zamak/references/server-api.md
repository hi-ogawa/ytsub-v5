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

## Edit a Video's Bookmarks

1. Read the video with `videos/getFullSession { youtubeId }`. It returns `{ video, captions, bookmarks }`, or `null` when the server doesn't have the video. A bookmark points at its row by `captionId`, the row's server id, and a row's position is its `idx`.
2. Change bookmarks by their server `id`:
   - `bookmarks/updateBookmark { id, translation?, etymology?, notes? }`
   - `bookmarks/createBookmarks { bookmarks: [{ videoId, captionId, text, side, offset, ... }] }`
   - `bookmarks/deleteBookmark { id }`

Take the ids from `getFullSession`, not from an AI prompt the app copied. The app's ids are local, and the server recreates its bookmarks under new ids on every push, so the two rarely match. Match the AI result to the server's bookmarks by `text` and row instead.

## Replace or Create a Video

To replace a video's captions, call `videos/importVideo` with the whole video. It takes the same `{ video, captions, bookmarks }` shape as [`import.json`](generate-import-json.md), and it replaces all of the video's captions and bookmarks. When the server doesn't have the video, `importVideo` creates it, so a new video doesn't need a push from the app first.

Its `video` also needs `vssId1` and `vssId2`, the ids of the YouTube caption tracks that `text1` and `text2` come from. For a video on the server, copy them from `getFullSession`. For a new video, write them for the tracks you built the rows from. The app looks a track up by its exact id, so write the id YouTube gives that track:

- `.<lang>` is a manual track, such as `.en` or `.en-US`.
- `a.<lang>` is an auto-generated (ASR) track, such as `a.ko`.
- `<source>.t.<lang>` is a machine translation of the track `<source>`, such as `a.ko.t.en`.

`<lang>` is the language code as YouTube lists it, region included. Set `language1` and `language2` to the code at the end of each id, because the app derives them that way when it saves the video.

## Keep the Server's Copy Current

The app keeps sessions in the browser and syncs them with the server one whole video at a time. A change on the server marks the video as changed there, and the user then pulls it, which replaces their local copy. So before you edit a video, make sure the user has pushed their latest local changes, because a pull drops anything that never reached the server.
