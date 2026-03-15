declare const __SERVER_URL__: string | undefined;

const STORAGE_KEY = "serverUrl";

/** Read override from chrome.storage.local and cache in globalThis. Call before getServerUrl(). */
export async function initServerUrl(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    (globalThis as any).__zamakServerUrl = result[STORAGE_KEY];
  }
}

/** Runtime-overridable server URL. Set `globalThis.__zamakServerUrl` before import to override. */
export function getServerUrl(): string {
  return (globalThis as any).__zamakServerUrl ?? __SERVER_URL__;
}

/** Prompt user to override the server URL (dev builds only). Returns true if changed. */
export async function promptServerUrlOverride(): Promise<boolean> {
  const current = (globalThis as any).__zamakServerUrl ?? "";
  const input = window.prompt("Server URL (empty = default):", current);
  if (input === null) return false; // cancelled
  if (input === "") {
    await chrome.storage.local.remove(STORAGE_KEY);
    delete (globalThis as any).__zamakServerUrl;
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY]: input });
    (globalThis as any).__zamakServerUrl = input;
  }
  return true;
}
