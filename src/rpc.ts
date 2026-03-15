import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "./server/rpc.ts";

let rpcUrl: string | URL = new URL("/api", self.location.href);
let rpcFetch: typeof globalThis.fetch = globalThis.fetch;

/** Override the RPC URL and/or fetch function. Call before any API requests. */
export function setRpcConfig(options: {
  url?: string | URL;
  fetch?: typeof globalThis.fetch;
}) {
  if (options.url) rpcUrl = options.url;
  if (options.fetch) rpcFetch = options.fetch;
}

const link = new RPCLink({
  url: () => rpcUrl,
  fetch: (request) => rpcFetch(request),
});

const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
