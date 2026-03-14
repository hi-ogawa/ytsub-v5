const DEFAULT_SERVER_URL = "https://ytsub-v5.hiroshi.workers.dev";

/** Runtime-overridable server URL. Set `globalThis.__zamakServerUrl` before import to override. */
export function getServerUrl(): string {
  return (
    ((globalThis as Record<string, unknown>).__zamakServerUrl as string) ??
    DEFAULT_SERVER_URL
  );
}
