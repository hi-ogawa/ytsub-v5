/**
 * Extension-specific oRPC client for popup and bookmarks pages.
 * Uses direct fetch with bearer token from chrome.storage.local.
 *
 * Not used by the content script (which has no server calls).
 */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "../server/rpc.ts";

declare const chrome: {
  storage: {
    local: {
      get: (
        keys: string[],
        cb: (result: Record<string, unknown>) => void,
      ) => void;
    };
  };
};

declare const __SERVER_URL__: string;

function getStorageValues(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

const link = new RPCLink({
  url: __SERVER_URL__ + "/api",
  fetch: async (request) => {
    const { "session-token": token } = await getStorageValues([
      "session-token",
    ]);
    if (token) {
      const headers = new Headers(request.headers);
      headers.set("authorization", `Bearer ${token}`);
      request = new Request(request, { headers });
    }
    return fetch(request);
  },
});

const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
