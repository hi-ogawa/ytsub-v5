import {
  type VideoIndexEntry,
  videoIndexStore,
} from "../../lib/video-index.ts";
import { chromeStorage } from "./chrome-storage.ts";

// Keeps this context's video index and chrome.storage.local in step, in both
// directions. docs/data-and-sync.md explains why each context keeps a copy.
export async function mirrorVideoIndex() {
  const key = videoIndexStore.key;

  // The JSON last read from or written to chrome.storage.local. Applying a
  // change from there notifies the store's subscriber, which would otherwise
  // write the same value back.
  let synced = JSON.stringify(
    (await chromeStorage.get<VideoIndexEntry[]>(key)) ?? [],
  );

  // set() rather than setLocal(), so the content script hears it even when
  // it read localStorage before this ran
  videoIndexStore.set(JSON.parse(synced));

  videoIndexStore.subscribe(() => {
    const json = JSON.stringify(videoIndexStore.get());
    if (json === synced) return;
    synced = json;
    chromeStorage.set({ [key]: videoIndexStore.get() });
  });

  chrome.storage.local.onChanged.addListener((changes) => {
    if (!(key in changes)) return;
    const value = (changes[key].newValue ?? []) as VideoIndexEntry[];
    const json = JSON.stringify(value);
    if (json === synced) return;
    synced = json;
    videoIndexStore.set(value);
  });
}
