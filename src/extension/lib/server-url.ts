import { chromeStorage } from "./chrome-storage.ts";

declare const __SERVER_URL__: string;

/** Server URL from the chrome.storage.local override, falling back to the build-time default. */
export async function getServerUrl(): Promise<string> {
  const stored = await chromeStorage.get<string>("serverUrl");
  return stored ?? __SERVER_URL__;
}
