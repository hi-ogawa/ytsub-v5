/**
 * Extension-specific oRPC client that routes requests through the
 * background service worker via chrome.runtime.sendMessage.
 *
 * This avoids YouTube CSP restrictions on fetch from the content script
 * and lets the background worker attach the bearer auth token.
 */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "../server/rpc.ts";

declare const chrome: {
  runtime: {
    sendMessage: (
      msg: Record<string, unknown>,
      cb: (response: Record<string, unknown>) => void,
    ) => void;
  };
};

function sendMessage(
  msg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

/**
 * Custom fetch that routes through the background worker.
 * The background worker attaches the bearer token and makes the actual fetch.
 */
async function extensionFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Strip the /api/ prefix — background worker adds it back with the server URL
  const path = url.pathname.replace(/^\/api\//, "");
  const body = request.method !== "GET" ? await request.json() : undefined;

  const res = await sendMessage({ type: "api-request", path, body });

  if (res.error) {
    return new Response(JSON.stringify({ message: res.error }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(res.data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const link = new RPCLink({
  url: "/api",
  fetch: extensionFetch,
});

const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
