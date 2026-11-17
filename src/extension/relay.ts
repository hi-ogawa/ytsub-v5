// ISOLATED world content script. docs/extension-runtime.md explains its role.

import { type VideoIndexEntry, videoIndexStore } from "../lib/video-index.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { setupRpcRelay, setupTabRpcRelay } from "./lib/extension-rpc.ts";

async function main() {
  const entries = await chromeStorage.get<VideoIndexEntry[]>(
    videoIndexStore.key,
  );
  videoIndexStore.setLocal(entries ?? []);

  videoIndexStore.subscribe(() => {
    chromeStorage.set({ [videoIndexStore.key]: videoIndexStore.get() });
  });

  setupRpcRelay();

  setupTabRpcRelay();
}

main();
