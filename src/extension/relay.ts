// ISOLATED world content script — BroadcastChannel RPC relay between MAIN world
// and background worker, plus store sync (localStorage ↔ chrome.storage).

import { type VideoIndexEntry, videoIndexStore } from "../lib/video-index.ts";
import { connectContentPort } from "./lib/content-ports.ts";
import { setupRpcRelay, setupTabRpcRelay } from "./lib/extension-rpc.ts";
import {
  bumpVersion,
  readVersionedBoot,
  readVersionedChange,
  writeVersioned,
} from "./lib/versioned-chrome-storage.ts";

async function main() {
  // Boot hydration: chrome.storage → store (writes to shared localStorage
  // so MAIN world's store picks up fresh data on init)
  const raw = await chrome.storage.local.get(videoIndexStore.key);
  const entries = readVersionedBoot<VideoIndexEntry[]>(
    videoIndexStore.key,
    raw[videoIndexStore.key],
  );
  videoIndexStore.setLocal(entries ?? []);

  // Subscribe writes to chrome.storage with current version (no bump).
  // Bump happens at origination points: BroadcastChannel receipt (below)
  // or adopted from onChanged (readVersionedChange sets lastVersion).
  videoIndexStore.subscribe(() => {
    writeVersioned(videoIndexStore.key, videoIndexStore.get());
  });

  // BroadcastChannel from MAIN — relay is proxy originator, so bump.
  // The store's internal BC listener also fires (separate BC instance, same
  // channel name) and calls setLocal → subscribe → writeVersioned with the
  // un-bumped version. That extra write is harmless: other contexts skip it
  // because v <= their lastVersion. Our listener bumps then calls setLocal,
  // triggering a second writeVersioned with the correct bumped version.
  const channel = new BroadcastChannel("zamak:store");
  channel.addEventListener("message", (e) => {
    if (e.data.key === videoIndexStore.key) {
      bumpVersion(videoIndexStore.key);
      videoIndexStore.setLocal(e.data.value);
    }
  });

  // chrome.storage onChanged — adopt version, no bump
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes[videoIndexStore.key];
    if (!change) return;
    const data = readVersionedChange(videoIndexStore.key, change.newValue);
    if (data === undefined) return;
    videoIndexStore.setLocal(data as VideoIndexEntry[]);
  });

  // Register with background so it can find this tab for reverse RPC
  connectContentPort();

  // Generic RPC relay — forwards all zamak:rpc events to background
  setupRpcRelay();

  // Reverse RPC relay — forwards background→tab calls to MAIN world
  setupTabRpcRelay();
}

main();
