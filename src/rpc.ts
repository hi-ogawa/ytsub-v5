import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "./server/rpc.ts";

const rpcConfig = {
  url: async () => new URL("/api", self.location.href),
  fetch: globalThis.fetch.bind(globalThis),
};

/** Override the RPC URL and/or fetch function. Call before any API requests. */
export function setRpcConfig(options: typeof rpcConfig) {
  Object.assign(rpcConfig, options);
}

const link = new RPCLink({
  url: () => rpcConfig.url(),
  fetch: (request) => rpcConfig.fetch(request),
});

const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
