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

## Look at the UI Without Logging In

`/_preview` shows the bookmarks page and the viewer with the seed videos and a fake sync status, so it needs no login and no data on the server. It works on `pnpm dev` and on each PR's Preview deployment, which makes it the quickest way to look at a change from a phone. A card on the bookmarks page opens that video in the viewer. The page uses the app's header, so its menu switches the theme as in the app. Next to it, a control picks the server error on the bookmarks page or the sync state in the viewer, and the URL keeps the choice, so a link such as `/_preview?page=watch&sync=conflict` opens that view directly. Bookmark edits last until the page reloads.

The page is for looking only. E2E tests run against the logged-in web app and the extension, which are what users run.

## Work on the Extension

1. In Chrome, open `chrome://extensions`, turn on Developer mode, and load `dist/extension/` with Load unpacked. Do this once.
2. Open a YouTube video and click the "Show captions" button to open the panel.
3. After each change, wait for the rebuild, click reload on the extension card in `chrome://extensions`, and then reload the YouTube tab.

The dev build is named `Zamak-dev [<branch> <commit> <time>]`, so the extension card shows when it was last built. To sync, sign in from the bookmarks page, which opens when you click the extension's icon.

## Check a Change Without Reloading

An e2e spec loads the built extension into Chromium on a mocked YouTube page, so it can show a panel change without reloading anything by hand. Run one spec, such as `pnpm test-e2e e2e/ext/caption-panel.spec.ts -g "<pattern>"`, and open its trace in `test-results/trace-pack.html`. [E2E tests](e2e.md) covers running and writing specs.
