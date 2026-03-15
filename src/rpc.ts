import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "./server/rpc.ts";

type UrlResolver = string | URL | (() => string | URL | Promise<string | URL>);

// NOTE: `rpcFetch` must be a `let` variable, NOT a property on an object.
// `obj.fetch(req)` sets `this` to `obj`, but native `fetch` is a Web IDL host
// method that requires `this` to be `window`/`globalThis`. Wrong `this` silently
// breaks cookie handling (session cookies not set after login). A bare `f(req)`
// call sets `this` to `undefined` which falls back to the global — correct.
//
//   BROKEN:  const obj = { fetch }; RPCLink({ fetch: (r) => obj.fetch(r) })
//   WORKS:   let f = fetch;         RPCLink({ fetch: (r) => f(r) })
//   WORKS:   RPCLink({ fetch: (r) => fetch.call(globalThis, r) })
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
