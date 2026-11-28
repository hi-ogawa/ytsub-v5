# Local Development

## Set Up

```sh
pnpm i
pnpm db:bootstrap   # create the local database and load the seed data
pnpm dev-full       # web app dev server and extension watch build
```

`pnpm dev-full` runs two processes:

- `pnpm dev` serves the web app and its API at http://localhost:5173/.
- `pnpm dev-ext` rebuilds the extension into `dist/extension/` whenever `src/` changes. This build talks to the local server, not production.

The seed data has two users, both with the password `devpassword`. `dev` owns the seed videos in `scripts/db-seed-json/`, and `dev-empty` owns nothing. Run `pnpm db:bootstrap` again to reset the database.

## Work on the Web App

The web app reloads on every save, so it is the fastest way to see a change to the bookmarks page or the caption panel.

1. Open http://localhost:5173/ and log in as `dev`.
2. On the bookmarks page, click a seed video's sync badge to pull it.
3. Click the video to open it in the viewer at `/videos/:id`.

The viewer only opens pulled videos, so it shows "No session available" until step 2. It can't fetch from YouTube, so it also has no track picker and can't start a new session. Use the extension for those.

## Work on the Extension

1. In Chrome, open `chrome://extensions`, turn on Developer mode, and load `dist/extension/` with Load unpacked. Do this once.
2. Open a YouTube video and click the "Show captions" button to open the panel.
3. After each change, wait for the rebuild, click reload on the extension card in `chrome://extensions`, and then reload the YouTube tab.

The dev build is named `Zamak-dev [<branch> <commit> <time>]`, so the extension card shows when it was last built. To sync, sign in from the bookmarks page, which opens when you click the extension's icon.

## Try a CI Build

CI builds the extension on every push. The latest build from `main` is always at [zamak-extension.zip](https://github.com/hi-ogawa/ytsub-v5/releases/download/extension-canary/zamak-extension.zip), on the `extension-canary` pre-release that each push to `main` updates, and a PR's build is linked at the end of its description. Unzip it and load the folder with Load unpacked. CI builds are named `Zamak [<commit>]` or `Zamak [PR#<number> <commit>]`.

## Check a Change Without Reloading

An e2e spec loads the built extension into Chromium on a mocked YouTube page, so it can show a panel change without reloading anything by hand. Run one spec, such as `pnpm test-e2e e2e/ext/caption-panel.spec.ts -g "<pattern>"`, and open its trace in `test-results/trace-pack.html`. [E2E tests](e2e.md) covers running and writing specs.
