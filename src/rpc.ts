import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "./server/rpc.ts";

type UrlResolver = string | URL | (() => string | URL | Promise<string | URL>);

// NOTE: `rpcFetch` must be a standalone `let` variable, NOT a property on an object.
// Accessing `fetch` via `obj.fetch(request)` breaks cookie handling in the browser
// (register/login fails — session cookie not set). Using a `let` variable with
// `rpcFetch(request)` works correctly. Confirmed minimal repro (url is irrelevant):
//
//   BROKEN:  const obj = { fetch }; RPCLink({ fetch: (r) => obj.fetch(r) })
//   WORKS:   let f = fetch;         RPCLink({ fetch: (r) => f(r) })
let rpcUrl: UrlResolver = new URL("/api", self.location.href);
let rpcFetch: typeof globalThis.fetch = fetch;

/** Override the RPC URL and/or fetch function. Call before any API requests. */
export function setRpcConfig(options: {
  url?: UrlResolver;
  fetch?: typeof globalThis.fetch;
}) {
  if (options.url) rpcUrl = options.url;
  if (options.fetch) rpcFetch = options.fetch;
}

const link = new RPCLink({
  url: () => (typeof rpcUrl === "function" ? rpcUrl() : rpcUrl),
  fetch: (request) => rpcFetch(request),
});

const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
