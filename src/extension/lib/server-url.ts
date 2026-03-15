import { chromeStorage } from "./chrome-storage.ts";

declare const __SERVER_URL__: string | undefined;

/** Runtime-overridable server URL. Checks chrome.storage.local first, then globalThis, then build-time constant. */
export async function getServerUrl(): Promise<string> {
  const stored = await chromeStorage.get<string>("serverUrl");
  return stored ?? (globalThis as any).__zamakServerUrl ?? __SERVER_URL__;
}
