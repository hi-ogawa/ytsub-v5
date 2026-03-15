import { chromeStorage } from "./chrome-storage.ts";

declare const __SERVER_URL__: string | undefined;

const STORAGE_KEY = "serverUrl";

/** Read override from chrome.storage.local and cache in globalThis. Call before getServerUrl(). */
export async function initServerUrl(): Promise<void> {
  const url = await chromeStorage.get<string>(STORAGE_KEY);
  if (url) {
    (globalThis as any).__zamakServerUrl = url;
  }
}

/** Runtime-overridable server URL. Set `globalThis.__zamakServerUrl` before import to override. */
export function getServerUrl(): string {
  return (globalThis as any).__zamakServerUrl ?? __SERVER_URL__;
}
