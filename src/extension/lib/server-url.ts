declare const __SERVER_URL__: string | undefined;

/** Runtime-overridable server URL. Set `globalThis.__zamakServerUrl` before import to override. */
export function getServerUrl(): string {
  return (globalThis as any).__zamakServerUrl ?? __SERVER_URL__;
}
